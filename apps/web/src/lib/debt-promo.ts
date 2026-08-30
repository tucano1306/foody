/**
 * debt-promo.ts — las promociones al 0 % que CADUCAN.
 *
 * Un saldo «al 0 % hasta el 25/01/2027» no es una deuda al 0 %: es una al 0 %
 * durante N meses y a la tasa normal a partir de ahí. La app lo trataba como
 * gratis para siempre, así que anunciaba «pagarás $0.00 de intereses» y callaba
 * la única fecha que de verdad importa de esa tarjeta.
 *
 * Aquí vive la aritmética de esa fecha: cuántos ciclos quedan, cuánto seguirá
 * debiéndose ese día, qué empezará a costar y qué cuota hace falta para llegar
 * a cero antes. Puro, sin SQL ni React.
 */

import {
  monthlyInterestOf,
  promoLastDueDate,
  promoMonthsLeft,
  toMonthlyRate,
  type RatePeriod,
} from './debt-engine';

// Se reexporta: vive en el motor para que este modulo no cree un ciclo de
// importaciones, pero conceptualmente es de aqui.
export { promoMonthsLeft };

export interface PromoInput {
  balance: number;
  /** Cuota mensual que se está pagando hoy. */
  installment: number;
  /** Fin de la promoción, YYYY-MM-DD. */
  promoEndsOn: string;
  /** Tasa que empieza a correr el día siguiente, tal como la escribió el banco. */
  rateAfterPromo: number;
  ratePeriod?: RatePeriod;
  /** Día del mes en que vence la cuota: decide cuántas caben antes de la fecha. */
  dueDay?: number | null;
  now?: Date;
}

export interface PromoRisk {
  /** Ciclos completos que quedan de promoción. 0 = ya caducó. */
  monthsLeft: number;
  /** Lo que seguirá debiéndose el día que caduque, a la cuota de hoy. */
  balanceAtEnd: number;
  /** Lo que ese resto empezará a costar cada mes. */
  monthlyCostAfter: number;
  /** Cuota necesaria para llegar a cero justo a tiempo. */
  installmentToClear: number;
  /** Cuánto más al mes que ahora hace falta. 0 si la cuota actual ya llega. */
  extraNeeded: number;
  /** La cuota de hoy no basta: el 0 % se acaba con saldo encima. */
  willMissDeadline: boolean;
  /**
   * Día en que cae la última cuota que entra en la promoción, YYYY-MM-DD.
   *
   * Entre esa fecha y `promoEndsOn` está todo el margen que hay. `null` cuando
   * no se sabe el día de vencimiento.
   */
  lastPaymentOn: string | null;
}

/**
 * Qué pasa cuando se acabe la promoción.
 *
 * `installmentToClear` es el número accionable de todo esto: la cuota con la
 * que se llega a cero justo a tiempo. Sin él, avisar de la fecha solo sirve
 * para preocupar.
 */
export function promoRisk(input: PromoInput): PromoRisk {
  const balance = Math.max(0, input.balance);
  const installment = Math.max(0, input.installment);
  const monthsLeft = promoMonthsLeft(input.promoEndsOn, input.now ?? new Date(), input.dueDay);
  const afterMonthly = toMonthlyRate(input.rateAfterPromo, input.ratePeriod ?? 'annual_nominal');

  // Durante la promoción la tasa es 0, así que cada cuota baja el saldo entera.
  const balanceAtEnd = Math.max(0, round2(balance - installment * monthsLeft));
  const installmentToClear = monthsLeft > 0 ? round2(balance / monthsLeft) : round2(balance);

  return {
    monthsLeft,
    balanceAtEnd,
    monthlyCostAfter: round2(monthlyInterestOf(balanceAtEnd, afterMonthly)),
    installmentToClear,
    extraNeeded: round2(Math.max(0, installmentToClear - installment)),
    willMissDeadline: balanceAtEnd > 0,
    lastPaymentOn: promoLastDueDate(input.promoEndsOn, input.now ?? new Date(), input.dueDay),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
