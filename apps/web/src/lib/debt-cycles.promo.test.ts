import { describe, expect, it } from 'vitest';
import type { DebtMovement } from './debt-data';
import { statementAccruals } from './debt-cycles';
import {
  accrualCycles,
  monthlyRateAfterPromo,
  projectDebt,
  promoTerms,
  promoVigente,
  tasaMensualDelDia,
} from './debt-engine';
import { promoRisk } from './debt-promo';

/**
 * El 0 % que caduca.
 *
 * Una deuda en promoción se guarda con `rate = 0`, `promo_ends_on` y
 * `rate_after_promo`. El devengo salía en cuanto veía la tasa en cero, así que
 * al caducar la promoción la app no cobraba NUNCA el saldo que quedaba, y el
 * banco sí: la tasa de después, desde el día siguiente al fin.
 *
 * Caso real, la Unlimited Cash 3650: un adelanto al 0 % hasta el 25 oct 2026
 * con ~$543 y otro hasta el 25 ene 2027 con $11,440. Pasadas esas fechas la
 * app decía «$0 de interés» mientras el banco cobra el 23.74 %.
 */

const APR = 23.74;
const DPR = APR / 100 / 365;
const CORTE = 25;

/** Un libro con sus fotos de saldo, como las deja `resnapshotLedger`. */
function libro(movs: readonly [y: number, m: number, d: number, monto: number, kind?: DebtMovement['kind']][]): DebtMovement[] {
  let saldo = 0;
  return movs.map(([y, m, d, monto, kind = 'charge'], i) => {
    const antes = saldo;
    saldo = Math.round((saldo + (kind === 'payment' ? -monto : monto)) * 100) / 100;
    return {
      id: `m${i}`,
      debtId: 'd1',
      kind,
      amount: monto,
      interestPart: 0,
      principalPart: kind === 'payment' ? monto : 0,
      feesPart: 0,
      balanceBefore: antes,
      balanceAfter: saldo,
      paymentMethod: null,
      periodKey: null,
      note: null,
      occurredAt: new Date(y, m - 1, d, 12).toISOString(),
    };
  });
}

/** El interés del banco para `dias` días sobre `saldo` quieto: diario y capitalizado. */
function capitalizado(saldo: number, dias: number, dpr = DPR): number {
  let interes = 0;
  for (let d = 0; d < dias; d++) interes += (saldo + interes) * dpr;
  return Math.round(interes * 100) / 100;
}

/** Último devengo en el corte de `y-m-25`, a medianoche menos un milisegundo. */
const corteDe = (y: number, m: number) => new Date(y, m - 1, CORTE, 23, 59, 59, 999);

const ADELANTO = libro([[2026, 9, 1, 543]]);

function devengar(movs: DebtMovement[], promoFin: string, desde: Date, hasta: Date, tasaPromo = 0) {
  return statementAccruals(movs, {
    statementDay: CORTE,
    annualRate: tasaPromo,
    from: desde,
    to: hasta,
    currentBalance: movs.at(-1)?.balanceAfter ?? 0,
    promo: { endsOn: promoFin, annualRateAfter: APR },
  });
}

describe('promoVigente / tasaMensualDelDia — el último día aún es promoción', () => {
  it('el día del fin cuenta como promoción; el siguiente, ya no', () => {
    expect(promoVigente('2026-10-25', '2026-10-25')).toBe(true);
    expect(promoVigente('2026-10-25', '2026-10-26')).toBe(false);
    expect(promoVigente(null, '2026-10-26')).toBe(false);
  });

  it('la tasa del día: 0 hasta el fin, la de después desde el siguiente', () => {
    const t = { rate: 0, ratePeriod: 'annual_nominal' as const, promoEndsOn: '2026-10-25', rateAfterPromo: APR };
    expect(tasaMensualDelDia(t, '2026-10-25')).toBe(0);
    expect(tasaMensualDelDia(t, '2026-10-26')).toBeCloseTo(APR / 1200, 12);
    expect(tasaMensualDelDia({ rate: 18.49, ratePeriod: 'annual_nominal' }, '2030-01-01')).toBeCloseTo(18.49 / 1200, 12);
  });
});

/**
 * La tasa de después es un APR, diga lo que diga `rate_period`.
 *
 * El formulario la pide como «Después, tasa anual». La Unlimited Cash 3650 está
 * guardada con `rate = 0` y `rate_period = 'monthly'` —en una deuda al 0 % el
 * período no se usa para nada—, y leer el 23.74 % en ese período lo convertía
 * en un 23.74 % MENSUAL. Con este mismo arreglo del devengo, eso habría sido
 * $2,715 de interés asentado cada mes desde el 26 ene 2027.
 */
describe('la tasa de después siempre es anual', () => {
  const TRES_SEIS_CINCO_CERO = {
    promoEndsOn: '2027-01-25',
    rateAfterPromo: APR,
  };

  it('23.74 es 23.74 % anual: 1.978 % al mes', () => {
    expect(monthlyRateAfterPromo(APR)).toBeCloseTo(0.2374 / 12, 12);
  });

  it('el devengo la toma anual aunque la deuda esté en «mensual»', () => {
    expect(promoTerms(TRES_SEIS_CINCO_CERO)).toEqual({ endsOn: '2027-01-25', monthlyRateAfter: monthlyRateAfterPromo(APR) });
    expect(promoTerms({ promoEndsOn: null, rateAfterPromo: APR })).toBeNull();
  });

  it('la tasa del día tras el fin no depende del período de la deuda', () => {
    const mensual = { rate: 0, ratePeriod: 'monthly' as const, ...TRES_SEIS_CINCO_CERO };
    expect(tasaMensualDelDia(mensual, '2027-01-26')).toBeCloseTo(0.2374 / 12, 12);
  });

  it('la proyección de la 3650 tras el fin: ~$231 de interés al mes, no $2,715', () => {
    const p = projectDebt({
      balance: 11440,
      rate: 0,
      ratePeriod: 'monthly',
      strategy: 'by_date',
      customPayment: 110,
      cycleDays: 31,
      ...TRES_SEIS_CINCO_CERO,
      now: new Date(2027, 0, 26, 12),
    });
    expect(p.monthlyInterest).toBe(Math.round(11440 * DPR * 31 * 100) / 100);
    expect(p.monthlyInterest).toBeLessThan(300);
  });

  it('el aviso de la promoción: lo que costará al mes es ~$226, no $2,715', () => {
    const r = promoRisk({ balance: 11440, installment: 0, now: new Date(2026, 8, 28), ...TRES_SEIS_CINCO_CERO });
    expect(r.monthlyCostAfter).toBeCloseTo(11440 * 0.2374 / 12, 0);
  });
});

describe('statementAccruals — un ciclo con promoción', () => {
  it('un ciclo entero dentro de la promoción no cobra nada', () => {
    // 26 sep – 25 oct, y la promoción dura hasta el 25 oct incluido.
    expect(devengar(ADELANTO, '2026-10-25', corteDe(2026, 9), new Date(2026, 9, 26, 12))).toEqual([]);
  });

  it('un ciclo que parte la promoción cobra SOLO los días de después', () => {
    // Fin el 10 oct: del 11 al 25 son 15 días a la tasa de después.
    const [ciclo] = devengar(ADELANTO, '2026-10-10', corteDe(2026, 9), new Date(2026, 9, 26, 12));
    expect(ciclo.periodKey).toBe('2026-10');
    expect(ciclo.days).toBe(30);
    expect(ciclo.interest).toBe(capitalizado(543, 15));
    // Y no el ciclo entero: eso serían 30 días.
    expect(ciclo.interest).toBeLessThan(capitalizado(543, 30));
    expect(ciclo.interest).toBeGreaterThan(0);
  });

  it('un ciclo entero después del fin cobra como cualquier otro', () => {
    const [ciclo] = devengar(ADELANTO, '2026-09-01', corteDe(2026, 9), new Date(2026, 9, 26, 12));
    expect(ciclo.interest).toBe(capitalizado(543, 30));
  });

  it('si el fin cae en el día de corte, ese ciclo es gratis y el siguiente cobra entero', () => {
    const ciclos = devengar(ADELANTO, '2026-10-25', corteDe(2026, 9), new Date(2026, 10, 26, 12));
    expect(ciclos.map((c) => c.periodKey)).toEqual(['2026-11']);
    expect(ciclos[0].days).toBe(31);
    expect(ciclos[0].interest).toBe(capitalizado(543, 31));
  });

  it('los $11,440 al 0 % hasta el 25 ene 2027: el 26 feb el banco ya ha cobrado un ciclo entero', () => {
    const grande = libro([[2026, 8, 6, 11440]]);
    const ciclos = devengar(grande, '2027-01-25', corteDe(2026, 8), new Date(2027, 1, 26, 12));
    // Hasta el corte del 25 ene, nada; el del 25 feb, 31 días al 23.74 %.
    expect(ciclos.map((c) => c.periodKey)).toEqual(['2027-02']);
    expect(ciclos[0].interest).toBe(capitalizado(11440, 31));
    expect(ciclos[0].interest).toBeGreaterThan(230);
  });

  it('una promoción con tasa propia cobra la suya hasta el fin y la de después desde el siguiente', () => {
    const [ciclo] = devengar(ADELANTO, '2026-10-10', corteDe(2026, 9), new Date(2026, 9, 26, 12), 6);
    let interes = 0;
    for (let d = 0; d < 30; d++) interes += (543 + interes) * ((d < 15 ? 6 : APR) / 100 / 365);
    expect(ciclo.interest).toBe(Math.round(interes * 100) / 100);
  });

  it('sin tasa y sin promoción no inventa intereses', () => {
    const ciclos = statementAccruals(ADELANTO, {
      statementDay: CORTE,
      annualRate: 0,
      from: corteDe(2026, 9),
      to: new Date(2026, 11, 26),
      currentBalance: 543,
    });
    expect(ciclos).toEqual([]);
  });
});

/**
 * Capitalizar a diario, comprobado contra el papel.
 *
 * El tramo de compras de la 3650: el estado de agosto cobró $23.93 sobre un
 * saldo promedio de $1,186.97, y el de septiembre $23.24 sobre $1,152.48. El
 * libro de abajo es ese tramo reconstruido de los dos estados. Con el interés
 * de cada día sumado al saldo del siguiente sale lo mismo que el papel; con la
 * fórmula plana de antes (promedio × APR/365 × días, sin capitalizar) salían
 * unos 23 centavos menos cada mes.
 */
describe('statementAccruals — capitaliza a diario, como el estado de cuenta', () => {
  const COMPRAS = libro([
    [2026, 7, 1, 1120.61],
    [2026, 8, 6, 132.48],
    [2026, 8, 17, 124.0],
    [2026, 8, 18, 258, 'payment'],
    [2026, 8, 30, 2, 'payment'],
  ]);

  const ciclos = statementAccruals(COMPRAS, {
    statementDay: CORTE,
    annualRate: APR,
    from: corteDe(2026, 7),
    to: new Date(2026, 8, 26, 12),
    currentBalance: 1141.02,
  });

  it('agosto: $23.93 sobre un promedio de $1,186.97', () => {
    expect(ciclos[0].periodKey).toBe('2026-08');
    expect(ciclos[0].interest).toBe(23.93);
    expect(ciclos[0].averageDailyBalance).toBeCloseTo(1186.97, 1);
  });

  it('septiembre, encadenado con el interés de agosto dentro: $23.24 sobre $1,152.48', () => {
    expect(ciclos[1].periodKey).toBe('2026-09');
    expect(ciclos[1].openingBalance).toBe(ciclos[0].closingBalance);
    expect(ciclos[1].interest).toBe(23.24);
    expect(ciclos[1].averageDailyBalance).toBeCloseTo(1152.48, 1);
  });
});

describe('accrualCycles — el camino sin día de corte también respeta el fin', () => {
  const mensual = APR / 100 / 12;

  it('los ciclos dentro de la promoción no cobran, y los de después sí', () => {
    const ciclos = accrualCycles({
      balance: 543,
      monthlyRate: 0,
      from: new Date(2026, 8, 1),
      to: new Date(2026, 11, 2),
      promo: { endsOn: '2026-10-31', monthlyRateAfter: mensual },
    });
    // 1 sep–1 oct y 1 oct–1 nov: dentro. 1 nov–1 dic: fuera entero.
    expect(ciclos.map((c) => c.periodKey)).toEqual(['2026-12']);
    expect(ciclos[0].interest).toBe(Math.round(543 * mensual * 100) / 100);
  });

  it('un ciclo partido cobra la parte proporcional de los días de después', () => {
    const [ciclo] = accrualCycles({
      balance: 1000,
      monthlyRate: 0,
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 2),
      // 1 sep – 1 oct son 30 días; desde el 16, 15 de ellos fuera.
      promo: { endsOn: '2026-09-15', monthlyRateAfter: mensual },
    });
    expect(ciclo.interest).toBe(Math.round(1000 * mensual * 0.5 * 100) / 100);
  });
});

describe('projectDebt — una promoción caducada ya no es «$0 al mes»', () => {
  const base = {
    balance: 543,
    rate: 0,
    ratePeriod: 'annual_nominal' as const,
    strategy: 'minimum' as const,
    minPercent: 1,
    minFloor: 35,
    promoEndsOn: '2026-10-25',
    rateAfterPromo: APR,
    cycleDays: 31,
  };

  it('en promoción, el interés del mes es cero', () => {
    expect(projectDebt({ ...base, now: new Date(2026, 9, 25, 12) }).monthlyInterest).toBe(0);
  });

  it('desde el día siguiente al fin, cobra la tasa de después', () => {
    const p = projectDebt({ ...base, now: new Date(2026, 9, 26, 12) });
    expect(p.monthlyInterest).toBe(Math.round(543 * DPR * 31 * 100) / 100);
    expect(p.monthlyRate).toBeCloseTo(APR / 100 / 12, 10);
  });
});
