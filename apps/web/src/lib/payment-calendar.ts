/**
 * payment-calendar.ts — dónde está un pago en el calendario del usuario.
 *
 * Qué meses se deben, si el de este mes está pagado, cuántos días faltan y
 * cuál es la próxima fecha. Lo calculaban TRES sitios (lib/api.ts, que pinta
 * la página de Pagos; GET /api/payments y GET /api/payments/[id], que la
 * recargan) y se habían separado: las dos rutas no le pasaban la frecuencia a
 * los atrasos, así que un seguro semestral recargado por la ruta volvía a
 * enseñar cinco meses de deuda que no existían.
 *
 * Y los tres contaban en la hora del servidor, UTC: la última noche del mes,
 * a partir de las 8 en Miami, un recibo que vence el 30 ya salía como del mes
 * siguiente. Aquí se cuenta en la zona del dispositivo del usuario.
 *
 * Módulo PURO. Se prueba en payment-calendar.test.ts.
 */

import { buildPaymentAggregates, type PaidRecordInput, type PaymentAggregates } from './payment-aggregates';
import { daysUntilNextDue, nextDueDate } from './payment-cycle';
import type { PaymentFrequency } from './payment-frequency';
import { horaDePared, mediodiaDelDia } from './zona';

export interface PaymentCalendar {
  readonly aggregates: PaymentAggregates;
  /** 0 = vence hoy, negativo = venció hace N días. */
  readonly daysUntilDue: number;
  /**
   * El día del próximo cobro, a mediodía UTC: es una FECHA, no un instante.
   * Antes iba la medianoche UTC de ese día, que en Miami son las 8 de la noche
   * del anterior: la tarjeta anunciaba «4 oct» para un recibo del 5.
   */
  readonly nextDueDate: string;
}

export function paymentCalendar(input: {
  /** Cuándo se dio de alta el pago: un instante real, de la base. */
  readonly createdAt: Date;
  readonly dueDay: number;
  readonly amount: number;
  readonly paidRecords: readonly PaidRecordInput[];
  readonly frequency: PaymentFrequency;
  readonly anchorMonth: number | null;
  readonly zona: string;
  /** El instante real de ahora. Por defecto, este. */
  readonly ahora?: Date;
}): PaymentCalendar {
  // Los motores cuentan con los campos locales de `Date`: se les da la hora de
  // pared del usuario, tanto para «ahora» como para el alta.
  const ahora = horaDePared(input.ahora ?? new Date(), input.zona);
  const aggregates = buildPaymentAggregates({
    createdAt: horaDePared(input.createdAt, input.zona),
    dueDay: input.dueDay,
    amount: input.amount,
    paidRecords: input.paidRecords,
    now: ahora,
    frequency: input.frequency,
    anchorMonth: input.anchorMonth,
  });
  const pagado = aggregates.isPaidThisMonth;
  return {
    aggregates,
    daysUntilDue: daysUntilNextDue(input.dueDay, pagado, ahora, input.frequency, input.anchorMonth),
    nextDueDate: mediodiaDelDia(nextDueDate(input.dueDay, pagado, ahora, input.frequency, input.anchorMonth)),
  };
}
