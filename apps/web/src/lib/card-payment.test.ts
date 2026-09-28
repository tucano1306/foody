import { describe, expect, it } from 'vitest';
import {
  allocateCardPayment,
  cardTitle,
  enPromocion,
  estimateCardMinimum,
  tasaVigente,
  type CardTramo,
} from './card-payment';

describe('cardTitle', () => {
  it('saca los últimos dígitos que llevan TODOS los nombres', () => {
    expect(
      cardTitle([
        { name: 'Unlimited  Cash 3650', issuer: 'Bank of America', accountLast4: null },
        { name: 'Compras 3650', issuer: 'Bank of America', accountLast4: null },
      ]),
    ).toBe('Bank of America ···3650');
  });

  it('los declarados mandan sobre los del nombre', () => {
    expect(cardTitle([{ name: 'Compras 3650', issuer: 'BofA', accountLast4: '9999' }])).toBe('BofA ···9999');
  });

  it('sin emisor ni dígitos comunes, «Tarjeta»', () => {
    expect(cardTitle([{ name: 'Compras 1111', issuer: null, accountLast4: null }, { name: 'Otra 2222', issuer: null, accountLast4: null }])).toBe('Tarjeta');
  });
});

/**
 * La Unlimited Cash 3650 al cierre del 25 sep 2026, reconstruida de los
 * estados de agosto y septiembre (ver «el reparto del banco, comprobado»).
 * Suman $13,303.26, el «Nuevo saldo total» del estado.
 */
const compras: CardTramo = {
  id: 'compras', name: 'Compras', balance: 1164.26,
  rate: 23.74, ratePeriod: 'annual_nominal', promoEndsOn: null, rateAfterPromo: null,
};
const promoOct: CardTramo = {
  id: 'promo-oct', name: 'Adelanto 0 % (oct)', balance: 699.0,
  rate: 0, ratePeriod: 'annual_nominal', promoEndsOn: '2026-10-25', rateAfterPromo: 23.74,
};
const promoEne: CardTramo = {
  id: 'promo-ene', name: 'Adelanto 0 % (ene)', balance: 11440.0,
  rate: 0, ratePeriod: 'annual_nominal', promoEndsOn: '2027-01-25', rateAfterPromo: 23.74,
};
const TARJETA = [compras, promoOct, promoEne];

const repartir = (amount: number, minimumDue: number, hoy = '2026-09-28', tramos = TARJETA) =>
  allocateCardPayment({ tramos, amount, minimumDue, hoy });

describe('allocateCardPayment — el mínimo va a la tasa más baja', () => {
  it('los $156 del mínimo de septiembre van enteros al adelanto que caduca en octubre', () => {
    const r = repartir(156, 156);
    expect(r.parts).toEqual([
      expect.objectContaining({ tramoId: 'promo-oct', amount: 156, fromMinimum: 156, fromExcess: 0, balanceAfter: 543 }),
    ]);
    expect(r.applied).toBe(156);
    expect(r.excessPart).toBe(0);
  });

  it('entre dos al 0 %, el mínimo va al que caduca antes, no al más grande', () => {
    const r = repartir(156, 156);
    expect(r.parts.map((p) => p.tramoId)).not.toContain('promo-ene');
  });

  it('pagar menos que el mínimo también va entero a la tasa más baja', () => {
    const r = repartir(100, 156);
    expect(r.minimumPart).toBe(100);
    expect(r.parts).toEqual([expect.objectContaining({ tramoId: 'promo-oct', amount: 100 })]);
  });

  it('si el mínimo no cabe en ese tramo, el resto del mínimo sigue al siguiente más barato', () => {
    const r = repartir(156, 156, '2026-09-28', [compras, { ...promoOct, balance: 100 }, promoEne]);
    expect(r.parts.map((p) => [p.tramoId, p.fromMinimum])).toEqual([
      ['promo-oct', 100],
      ['promo-ene', 56],
    ]);
  });
});

describe('allocateCardPayment — lo que pasa del mínimo va a la tasa más alta', () => {
  it('$500 con mínimo $156: $156 al adelanto, $344 a compras al 23.74 %', () => {
    const r = repartir(500, 156);
    expect(r.parts.map((p) => [p.tramoId, p.fromMinimum, p.fromExcess])).toEqual([
      ['promo-oct', 156, 0],
      ['compras', 0, 344],
    ]);
    expect(r.parts[1].balanceAfter).toBe(820.26);
  });

  it('pagando solo el mínimo, compras —el único que cobra interés— no baja nunca', () => {
    const r = repartir(156, 156);
    expect(r.parts.find((p) => p.tramoId === 'compras')).toBeUndefined();
  });

  it('pagar más que toda la tarjeta deja un sobrante, no un saldo negativo', () => {
    const r = repartir(14000, 156);
    expect(r.applied).toBe(13303.26);
    expect(r.overpayment).toBe(696.74);
    expect(r.parts.every((p) => p.balanceAfter === 0)).toBe(true);
  });

  it('un abono vacío o ilegible no reparte nada', () => {
    expect(repartir(0, 156).parts).toEqual([]);
    expect(repartir(Number.NaN, 156).parts).toEqual([]);
  });
});

describe('las promociones caducan', () => {
  it('el último día de la promoción todavía cuenta', () => {
    expect(enPromocion(promoOct, '2026-10-25')).toBe(true);
    expect(enPromocion(promoOct, '2026-10-26')).toBe(false);
  });

  it('caducada, el tramo pasa a su tasa de después', () => {
    expect(tasaVigente(promoOct, '2026-10-25')).toBe(0);
    expect(tasaVigente(promoOct, '2026-10-26')).toBeCloseTo(0.2374 / 12, 10);
  });

  it('desde el 26 oct el mínimo ya no va al adelanto de octubre, sino al 0 % de enero', () => {
    const r = repartir(156, 156, '2026-10-26', [compras, { ...promoOct, balance: 543 }, promoEne]);
    expect(r.parts).toEqual([expect.objectContaining({ tramoId: 'promo-ene', fromMinimum: 156 })]);
  });
});

describe('estimateCardMinimum — la fórmula del banco sobre la tarjeta entera', () => {
  it('septiembre: 1 % de $13,280.02 + $23.24 de interés = $156', () => {
    expect(estimateCardMinimum([{ principal: 13280.02, interest: 23.24, fees: 0 }])).toBe(156);
  });

  it('agosto: 1 % de $13,416.09 + $23.93 = $158', () => {
    expect(estimateCardMinimum([{ principal: 13416.09, interest: 23.93, fees: 0 }])).toBe(158);
  });

  it('suma los tramos: da lo mismo repartido en tres', () => {
    expect(
      estimateCardMinimum([
        { principal: 1141.02, interest: 23.24, fees: 0 },
        { principal: 699.0, interest: 0, fees: 0 },
        { principal: 11440.0, interest: 0, fees: 0 },
      ]),
    ).toBe(156);
  });
});

/**
 * El reparto del banco, comprobado.
 *
 * Se simulan los dos ciclos día a día como dice el contrato: tasa diaria =
 * APR / 365, transacciones desde su fecha, interés capitalizado cada día. El
 * pago del 18 ago ($415) se reparte con un mínimo de julio de $157, y el del
 * 30 ago ($160) con el de agosto, $158. Con esa regla salen los cuatro saldos
 * promedio y los dos intereses de los estados, al centavo; sin capitalizar, el
 * promedio de compras se queda ~$11 corto.
 */
describe('el reparto del banco, comprobado contra los estados de la 3650', () => {
  const DPR = 0.2374 / 365;

  function ciclo(inicio: number, movs: readonly { dia: number; monto: number }[]) {
    let saldo = inicio;
    let suma = 0;
    let interes = 0;
    for (let dia = 0; dia < 31; dia++) {
      for (const m of movs) if (m.dia === dia) saldo += m.monto;
      suma += saldo;
      const i = saldo * DPR;
      interes += i;
      saldo += i;
    }
    return { promedio: suma / 31, interes };
  }

  // Agosto (26 jul – 25 ago): el promedio del adelanto (973.48) fija su saldo
  // inicial; compras es el resto del «saldo anterior» menos los $11,440.
  const pagoAgosto = allocateCardPayment({
    tramos: [
      { ...compras, balance: 1120.61 },
      { ...promoOct, balance: 1014.0 },
      promoEne,
    ],
    amount: 415,
    minimumDue: 157,
    hoy: '2026-08-18',
  });
  const aCompras = pagoAgosto.parts.find((p) => p.tramoId === 'compras')!.amount;
  const aPromo = pagoAgosto.parts.find((p) => p.tramoId === 'promo-oct')!.amount;

  it('agosto: $157 al adelanto y $258 a compras', () => {
    expect([aPromo, aCompras]).toEqual([157, 258]);
  });

  it('agosto: compras promedia $1,186.97 y cobra $23.93', () => {
    // 6 ago = día 11, 17 ago = día 22, 18 ago = día 23.
    const c = ciclo(1120.61, [
      { dia: 11, monto: 132.48 },
      { dia: 22, monto: 124.0 },
      { dia: 23, monto: -aCompras },
    ]);
    expect(c.promedio).toBeCloseTo(1186.97, 1);
    expect(c.interes).toBeCloseTo(23.93, 2);
  });

  it('agosto: el adelanto promedia $973.48', () => {
    expect(1014.0 - (aPromo * 8) / 31).toBeCloseTo(973.48, 1);
  });

  it('septiembre: $158 al adelanto, $2 a compras; promedios $1,152.48 y $719.38, interés $23.24', () => {
    const r = allocateCardPayment({
      tramos: [
        { ...compras, balance: 1143.02 },
        { ...promoOct, balance: 857.0 },
        promoEne,
      ],
      amount: 160,
      minimumDue: 158,
      hoy: '2026-08-30',
    });
    expect(r.parts.map((p) => [p.tramoId, p.amount])).toEqual([
      ['promo-oct', 158],
      ['compras', 2],
    ]);

    const c = ciclo(1143.02, [{ dia: 4, monto: -2 }]);
    expect(c.promedio).toBeCloseTo(1152.48, 1);
    expect(c.interes).toBeCloseTo(23.24, 2);
    expect(857.0 - (158 * 27) / 31).toBeCloseTo(719.38, 1);
  });

  it('y los tres tramos suman el saldo del estado: $13,303.26', () => {
    expect(Math.round((1164.26 + 699.0 + 11440.0) * 100) / 100).toBe(13303.26);
  });
});
