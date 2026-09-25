import { describe, expect, it } from 'vitest';
import type { PaidRecordInput } from './payment-aggregates';
import { paymentCalendar } from './payment-calendar';

const MIAMI = 'America/New_York';

/** 22:00 del 30 de septiembre en Miami: en UTC ya es el 1 de octubre. */
const NOCHE_DEL_30 = new Date('2026-10-01T02:00:00.000Z');

const pagado = (month: number, year = 2026): PaidRecordInput => ({
  month,
  year,
  amount: 100,
  actualAmount: null,
  paidAt: null,
});

function recibo(paidRecords: PaidRecordInput[], zona: string, ahora: Date, extra: Partial<Parameters<typeof paymentCalendar>[0]> = {}) {
  return paymentCalendar({
    createdAt: new Date('2026-06-01T16:00:00.000Z'),
    dueDay: 30,
    amount: 100,
    paidRecords,
    frequency: 'monthly',
    anchorMonth: null,
    zona,
    ahora,
    ...extra,
  });
}

describe('paymentCalendar — la última noche del mes, desde Miami', () => {
  it('pagado septiembre, a las 22:00 del 30 sigue «al día», no «pendiente de octubre»', () => {
    const cal = recibo([pagado(6), pagado(7), pagado(8), pagado(9)], MIAMI, NOCHE_DEL_30);
    expect(cal.aggregates.isPaidThisMonth).toBe(true);
    expect(cal.aggregates.missedMonths).toBe(0);
    expect(cal.daysUntilDue).toBe(30);
  });

  it('en UTC, el mismo instante ya contaba octubre: el fallo que se arregla', () => {
    const cal = recibo([pagado(6), pagado(7), pagado(8), pagado(9)], 'UTC', NOCHE_DEL_30);
    expect(cal.aggregates.isPaidThisMonth).toBe(false);
  });

  it('sin pagar, el recibo del 30 «vence hoy» y todavía no es un atraso', () => {
    const cal = recibo([pagado(6), pagado(7), pagado(8)], MIAMI, NOCHE_DEL_30);
    expect(cal.daysUntilDue).toBe(0);
    expect(cal.aggregates.missedMonths).toBe(0);
  });

  it('en UTC ese mismo recibo ya salía atrasado un mes', () => {
    const cal = recibo([pagado(6), pagado(7), pagado(8)], 'UTC', NOCHE_DEL_30);
    expect(cal.aggregates.missedMonths).toBe(1);
  });
});

describe('paymentCalendar — la próxima fecha es un DÍA', () => {
  it('va a mediodía UTC: en Miami se lee el 30 y no el 29', () => {
    const cal = recibo([pagado(6), pagado(7), pagado(8), pagado(9)], MIAMI, NOCHE_DEL_30);
    expect(cal.nextDueDate).toBe('2026-10-30T12:00:00.000Z');
    const dia = new Intl.DateTimeFormat('en-US', { timeZone: MIAMI, day: 'numeric' }).format(new Date(cal.nextDueDate));
    expect(dia).toBe('30');
  });
});

describe('paymentCalendar — la frecuencia cuenta en todos los sitios', () => {
  it('un seguro semestral no acumula atrasos en los meses que no toca', () => {
    // Cobra en junio y diciembre; junio pagado. A finales de septiembre no se
    // debe nada, aunque julio, agosto y septiembre no tengan pago.
    const cal = recibo([pagado(6)], MIAMI, new Date('2026-09-25T16:00:00.000Z'), {
      frequency: 'semiannual',
      anchorMonth: 6,
    });
    expect(cal.aggregates.missedMonths).toBe(0);
    expect(cal.aggregates.isPaidThisMonth).toBe(true);
    expect(cal.nextDueDate).toBe('2026-12-30T12:00:00.000Z');
  });
});
