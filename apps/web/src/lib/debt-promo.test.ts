import { describe, expect, it } from 'vitest';
import { cycleInterestOf, projectDebt } from './debt-engine';
 import { promoMonthsLeft, promoRisk } from './debt-promo';

/**
 * El caso real, sacado de un estado de Bank of America:
 *
 *   Saldo promocional  $11,440.00 al 0 % hasta el 25/01/2027
 *   Tasa normal        23,74 % anual
 *   Cuota actual       $2,288.00
 *
 * La app decía «Libre en 5 meses, pagarás $0.00 de intereses» y no mencionaba
 * la fecha. Es cierto solo si se llega a cero antes del 25/01/2027.
 */
const HOY = new Date(2026, 7, 26); // 26 de agosto de 2026

describe('promoMonthsLeft', () => {
  it('cuenta los ciclos que quedan hasta el fin de la promoción', () => {
    // De agosto a enero, con el día 25 aún por delante en enero.
    expect(promoMonthsLeft('2027-01-25', HOY)).toBe(4);
  });

  it('el mes en curso no cuenta si su día ya pasó', () => {
    // Vence el 25 y hoy es 26: ese ciclo ya se fue.
    expect(promoMonthsLeft('2026-10-25', new Date(2026, 7, 26))).toBe(1);
    expect(promoMonthsLeft('2026-10-25', new Date(2026, 7, 20))).toBe(2);
  });

  it('una promoción vencida no deja margen', () => {
    expect(promoMonthsLeft('2026-06-25', HOY)).toBe(0);
    expect(promoMonthsLeft('2026-08-26', HOY)).toBe(0);
  });

  it('una fecha ilegible no inventa plazo', () => {
    expect(promoMonthsLeft('', HOY)).toBe(0);
    expect(promoMonthsLeft('no es fecha', HOY)).toBe(0);
  });

  /**
   * Con el dia de vencimiento se cuentan los PAGOS que caben, no los meses que
   * caben. La diferencia no es teorica: la 6791 vence el 24 y su promo muere el
   * 27/09/2027, asi que caben trece cuotas —la ultima, tres dias antes—, pero
   * contando meses completos desde un 30 de agosto salian doce y la hoja
   * avisaba de un descubierto de $480 que no existe.
   */
  describe('contando vencimientos', () => {
    it('cuenta los pagos que caben, no los meses', () => {
      expect(promoMonthsLeft('2027-09-27', new Date(2026, 7, 30), 24)).toBe(13);
      expect(promoMonthsLeft('2027-09-27', new Date(2026, 7, 30))).toBe(12);
    });

    it('deja de depender del dia en que se mire la pantalla', () => {
      // Mismo credito, tres dias distintos del mismo mes: el vencimiento del
      // 24 de agosto ya paso en los tres, asi que la respuesta no cambia.
      for (const dia of [25, 30, 31]) {
        expect(promoMonthsLeft('2027-09-27', new Date(2026, 7, dia), 24)).toBe(13);
      }
    });

    it('el vencimiento de hoy todavia cuenta', () => {
      expect(promoMonthsLeft('2026-10-27', new Date(2026, 7, 24), 24)).toBe(3);
      // Un dia despues ya se fue.
      expect(promoMonthsLeft('2026-10-27', new Date(2026, 7, 25), 24)).toBe(2);
    });

    it('el que cae justo el ultimo dia entra', () => {
      expect(promoMonthsLeft('2027-01-25', new Date(2026, 7, 30), 25)).toBe(5);
      // Un dia antes de la promo, ese ultimo pago ya no llega.
      expect(promoMonthsLeft('2027-01-24', new Date(2026, 7, 30), 25)).toBe(4);
    });

    it('los meses cortos recortan el dia, como hace el banco', () => {
      // Vencimiento el 31: febrero paga el 28 y sigue contando.
      expect(promoMonthsLeft('2027-03-31', new Date(2026, 11, 31), 31)).toBe(4);
    });

    it('un dia de vencimiento imposible no cuenta como valido', () => {
      expect(promoMonthsLeft('2027-09-27', new Date(2026, 7, 30), 0)).toBe(12);
      expect(promoMonthsLeft('2027-09-27', new Date(2026, 7, 30), 99)).toBe(12);
    });
  });
});

describe('promoRisk — el saldo de $11,440 al 0 %', () => {
  const base = {
    balance: 11_440,
    promoEndsOn: '2027-01-25',
    rateAfterPromo: 23.74,
    now: HOY,
  };

  it('con la cuota actual NO llega: quedan $2,288 cuando caduca', () => {
    // 4 ciclos × $2,288 = $9,152. Faltan $2,288.
    const r = promoRisk({ ...base, installment: 2288 });
    expect(r.monthsLeft).toBe(4);
    expect(r.balanceAtEnd).toBe(2288);
    expect(r.willMissDeadline).toBe(true);
  });

  it('dice lo que ese resto empezará a costar cada mes', () => {
    const r = promoRisk({ ...base, installment: 2288 });
    // $2,288 × 23,74 % / 12 = $45.26
    expect(r.monthlyCostAfter).toBeCloseTo(45.26, 2);
  });

  it('dice la cuota con la que SÍ se llega', () => {
    // El número accionable: $11,440 / 4 = $2,860 al mes.
    const r = promoRisk({ ...base, installment: 2288 });
    expect(r.installmentToClear).toBe(2860);
    expect(r.extraNeeded).toBe(572);
  });

  it('con la cuota suficiente no hay riesgo que avisar', () => {
    const r = promoRisk({ ...base, installment: 2860 });
    expect(r.balanceAtEnd).toBe(0);
    expect(r.monthlyCostAfter).toBe(0);
    expect(r.extraNeeded).toBe(0);
    expect(r.willMissDeadline).toBe(false);
  });

  it('pagando de más tampoco deja saldo negativo', () => {
    const r = promoRisk({ ...base, installment: 5000 });
    expect(r.balanceAtEnd).toBe(0);
  });
});

describe('promoRisk — el saldo de $973.48 que vence antes', () => {
  it('con un solo ciclo por delante, la cuota es el saldo entero', () => {
    const r = promoRisk({
      balance: 973.48,
      installment: 973,
      promoEndsOn: '2026-10-25',
      rateAfterPromo: 23.74,
      now: HOY,
    });
    expect(r.monthsLeft).toBe(1);
    expect(r.installmentToClear).toBe(973.48);
    // Se queda a 48 centavos: la app tiene que decirlo, no redondearlo a «vas bien».
    expect(r.balanceAtEnd).toBe(0.48);
    expect(r.willMissDeadline).toBe(true);
  });
});

describe('promoRisk — promoción ya vencida', () => {
  it('sin ciclos, el saldo entero ya está a la tasa normal', () => {
    const r = promoRisk({
      balance: 1000,
      installment: 100,
      promoEndsOn: '2026-01-25',
      rateAfterPromo: 23.74,
      now: HOY,
    });
    expect(r.monthsLeft).toBe(0);
    expect(r.balanceAtEnd).toBe(1000);
    expect(r.willMissDeadline).toBe(true);
  });
})

/**
 * El interés tal como lo cobra la tarjeta. Verificado contra un estado real:
 * saldo sujeto a intereses $1,186.97, APR 23,74 %, ciclo de 31 días → $23.93.
 */
describe('cycleInterestOf — la fórmula del banco', () => {
  it('reproduce al céntimo el cargo del estado de cuenta', () => {
    expect(cycleInterestOf(1186.97, 23.74, 31)).toBeCloseTo(23.93, 2);
  });

  it('un ciclo más corto cobra menos', () => {
    const treintaYUno = cycleInterestOf(1186.97, 23.74, 31);
    const veintiocho = cycleInterestOf(1186.97, 23.74, 28);
    expect(veintiocho).toBeLessThan(treintaYUno);
    expect(veintiocho).toBeCloseTo(21.62, 2);
  });

  it('difiere de dividir entre doce, que es lo que hacía la app', () => {
    const banco = cycleInterestOf(1186.97, 23.74, 31);
    const entreDoce = (1186.97 * 23.74) / 100 / 12;
    expect(entreDoce).toBeCloseTo(23.48, 2);
    expect(banco - entreDoce).toBeGreaterThan(0.4);
  });

  it('sin saldo, sin tasa o sin días no hay interés', () => {
    expect(cycleInterestOf(0, 23.74, 31)).toBe(0);
    expect(cycleInterestOf(1000, 0, 31)).toBe(0);
    expect(cycleInterestOf(1000, 23.74, 0)).toBe(0);
  });
})

/**
 * La proyección entera con la promoción dentro.
 *
 * Es lo que se veía mal en pantalla: «Libre en 5 meses, pagarás $0.00 de
 * intereses» para un saldo que, a esa cuota, llega al 25/01/2027 con $2,288
 * encima y empieza a costar 23,74 %.
 */
describe('projectDebt — el saldo promocional de Bank of America', () => {
  const base = {
    balance: 11_440,
    rate: 0,
    ratePeriod: 'annual_nominal' as const,
    strategy: 'custom' as const,
    customPayment: 2288,
    promoEndsOn: '2027-01-25',
    rateAfterPromo: 23.74,
    now: new Date(2026, 7, 26),
  };

  it('sin la promo, la app promete que no cuesta nada', () => {
    const { rate, ratePeriod, ...sinPromo } = base;
    const p = projectDebt({ ...sinPromo, rate, ratePeriod, promoEndsOn: null, rateAfterPromo: null });
    expect(p.totalInterest).toBe(0);
    expect(p.monthsToPayoff).toBe(5);
  });

  it('con la promo, el interés APARECE: la deuda sobrevive a la fecha', () => {
    const p = projectDebt(base);
    // Cuatro cuotas al 0 %, y lo que queda ya paga intereses.
    expect(p.totalInterest).toBeGreaterThan(0);
  });

  it('subir la cuota a lo que hace falta lo devuelve a cero intereses', () => {
    const p = projectDebt({ ...base, customPayment: 2860 });
    expect(p.totalInterest).toBe(0);
    expect(p.monthsToPayoff).toBe(4);
  });

  it('el interés del mes se calcula como el banco cuando se saben los días', () => {
    // El saldo de compras del mismo estado: $1,186.97 al 23,74 %, ciclo de 31.
    const p = projectDebt({
      balance: 1186.97,
      rate: 23.74,
      ratePeriod: 'annual_nominal',
      strategy: 'minimum',
      cycleDays: 31,
      now: new Date(2026, 7, 26),
    });
    expect(p.monthlyInterest).toBeCloseTo(23.93, 2);
  });

  it('sin los días del ciclo se sigue calculando como antes', () => {
    const p = projectDebt({
      balance: 1186.97,
      rate: 23.74,
      ratePeriod: 'annual_nominal',
      strategy: 'minimum',
      now: new Date(2026, 7, 26),
    });
    expect(p.monthlyInterest).toBeCloseTo(23.48, 2);
  });
})
