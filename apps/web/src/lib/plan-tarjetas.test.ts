import { describe, expect, it } from 'vitest';
import type { CondicionesDeCredito } from './condiciones-credito';
import { agruparPorTarjeta, minimosDelBanco, sugerirDeudaParaMeta, type CreditoParaMinimo } from './plan-tarjetas';

const G = 'grupo-3650';

describe('agruparPorTarjeta', () => {
  const creditos = [
    { id: 'compras', cardGroup: G },
    { id: 'auto', cardGroup: null },
    { id: 'unlimited', cardGroup: G },
    { id: 'saldo-nuevo', cardGroup: G },
    { id: 'sola', cardGroup: 'grupo-de-uno' },
  ];

  it('junta los tramos de una tarjeta donde aparece el primero, sin cambiar el orden del resto', () => {
    const filas = agruparPorTarjeta(creditos);
    expect(filas.map((f) => (f.tipo === 'tarjeta' ? f.grupo : f.credito.id))).toEqual([G, 'auto', 'sola']);
    const tarjeta = filas[0];
    expect(tarjeta.tipo === 'tarjeta' && tarjeta.tramos.map((t) => t.id)).toEqual(['compras', 'unlimited', 'saldo-nuevo']);
  });

  it('una tarjeta de un solo tramo va suelta, como en Deudas', () => {
    const filas = agruparPorTarjeta(creditos);
    expect(filas[2]).toEqual({ tipo: 'suelto', credito: { id: 'sola', cardGroup: 'grupo-de-uno' } });
  });

  it('sin créditos, sin filas', () => {
    expect(agruparPorTarjeta([])).toEqual([]);
  });
});

describe('sugerirDeudaParaMeta', () => {
  // Las deudas y las dos metas del dueño el 31 oct 2026.
  const unlimited = { id: 'unlimited', name: 'Unlimited  Cash 3650', balance: 11286, accountLast4: '3650', promoEndsOn: '2027-01-25' };
  const compras = { id: 'compras', name: 'Compras 3650', balance: 1177.04, accountLast4: '3650', promoEndsOn: null };
  const saldoNuevo = { id: 'saldo-nuevo', name: 'Saldo nuevo 3650', balance: 553.4, accountLast4: '3650', promoEndsOn: null };
  const cashRewards = { id: '8523', name: 'Cash Rewards  8523', balance: 2153.22, accountLast4: '8523', promoEndsOn: null };
  const deudas = [unlimited, compras, saldoNuevo, cashRewards];

  const meta = (over: Partial<Parameters<typeof sugerirDeudaParaMeta>[0]>) => ({
    name: 'tarjeta 3650 cash rewards',
    kind: 'debt',
    targetAmount: 11440,
    targetDate: '2027-01-25',
    debtId: null,
    ...over,
  });

  it('la meta de $11,440 al 25 ene es el 0 % que acaba ese día', () => {
    expect(sugerirDeudaParaMeta(meta({}), deudas)).toBe(unlimited);
  });

  it('la de $1,014 al 25 oct podría ser cualquiera de los tres tramos: no se adivina', () => {
    expect(sugerirDeudaParaMeta(meta({ targetAmount: 1014, targetDate: '2026-10-25' }), deudas)).toBeNull();
  });

  it('«cash rewards» en el nombre no basta: manda el número de la tarjeta', () => {
    expect(sugerirDeudaParaMeta(meta({ name: 'cash rewards', targetAmount: 999, targetDate: null }), deudas)).toBeNull();
  });

  it('número y saldo casi igual bastan', () => {
    expect(sugerirDeudaParaMeta(meta({ name: 'Pagar la 8523', targetAmount: 2200, targetDate: null }), deudas)).toBe(cashRewards);
  });

  it('una meta que no es de deuda, o ya enlazada, no se toca', () => {
    expect(sugerirDeudaParaMeta(meta({ kind: 'trip' }), deudas)).toBeNull();
    expect(sugerirDeudaParaMeta(meta({ debtId: 'compras' }), deudas)).toBeNull();
  });

  it('una deuda ya pagada no se propone', () => {
    expect(sugerirDeudaParaMeta(meta({}), [{ ...unlimited, balance: 0 }])).toBeNull();
  });

  it('el último dígito declarado cuenta aunque el nombre no lo lleve', () => {
    const sinNumero = { ...unlimited, name: 'Unlimited Cash' };
    expect(sugerirDeudaParaMeta(meta({}), [sinNumero, compras])).toBe(sinNumero);
  });
});

describe('minimosDelBanco — lo que exige el banco, aparte del plan para liquidar', () => {
  // Una tarjeta de $9,000 al 0 % que el usuario quiere dejar en cero en tres
  // meses: su plan abona $3,000, el banco pide mucho menos.
  const tramo = (over: Partial<CreditoParaMinimo> = {}): CreditoParaMinimo => ({
    id: 't', cardGroup: null, kind: 'credit_card', strategy: 'by_date', balance: 9000, installment: 3000,
    monthlyInterest: 0, issuer: 'Bank of America', currency: 'USD', minPercent: null, minFloor: null,
    minIncludesInterest: false, ...over,
  });

  it('con un plan para llegar a cero, el mínimo es el del banco y no la cuota del plan', () => {
    // Bank of America: 1 % + intereses, piso de $35. Sobre $9,000 al 0 %: $90.
    expect(minimosDelBanco([tramo()], new Map()).get('t')).toBe(90);
  });

  it('nunca pasa de la cuota: el piso de $35 no sube una cuota de $20', () => {
    expect(minimosDelBanco([tramo({ balance: 500, installment: 20 })], new Map()).get('t')).toBe(20);
  });

  it('en «mínimo», la cuota ya es lo que pide el banco', () => {
    expect(minimosDelBanco([tramo({ strategy: 'minimum', installment: 120 })], new Map()).get('t')).toBe(120);
  });

  it('un préstamo no tiene mínimo aparte: su cuota es la del contrato', () => {
    expect(minimosDelBanco([tramo({ kind: 'auto', installment: 450 })], new Map()).get('t')).toBe(450);
  });

  it('una tarjeta con tramos tiene UN mínimo, repartido entre ellos por saldo', () => {
    // $6,000 + $3,000 de la misma cuenta: el 1 % de $9,000 son $90.
    const m = minimosDelBanco(
      [
        tramo({ id: 'a', cardGroup: 'g', balance: 6000, installment: 2000 }),
        tramo({ id: 'b', cardGroup: 'g', balance: 3000, installment: 1000 }),
      ],
      new Map(),
    );
    expect([m.get('a'), m.get('b')]).toEqual([60, 30]);
  });

  it('usa las condiciones guardadas de la cuenta, las mismas que lee Deudas', () => {
    const fija: CondicionesDeCredito = {
      plantilla: 'fijo',
      minimo: { regla: 'fijo', porcentaje: 0, piso: 0, fijo: 150 },
      abono: 'ley_eeuu',
      atraso: { cargo: null, tasaPenal: null },
    };
    const m = minimosDelBanco(
      [tramo({ id: 'a', cardGroup: 'g', balance: 6000 }), tramo({ id: 'b', cardGroup: 'g', balance: 3000 })],
      new Map([['g', fija]]),
    );
    expect([m.get('a'), m.get('b')]).toEqual([100, 50]);
  });

  it('una suelta lee su regla de sus campos: un piso sin porcentaje es «el mayor entre el 5 % y el piso»', () => {
    // Igual que en Deudas. Un mínimo que es siempre la misma cifra se guarda
    // como «cuota fija», no como piso.
    expect(minimosDelBanco([tramo({ issuer: null, balance: 4000, minFloor: 60 })], new Map()).get('t')).toBe(200);
  });
});
