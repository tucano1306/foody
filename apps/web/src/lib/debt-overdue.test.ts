import { describe, expect, it } from 'vitest';
import { isDebtOverdue } from './debt-engine';

/**
 * «El aviso que respira, tambien en las deudas atrasadas.»
 *
 * En Pagos existe desde hace meses; en Deudas no habia forma de encenderlo,
 * porque `daysUntilDue` NUNCA es negativo: pasado el dia, rueda al mes
 * siguiente. Asi que «atrasada» se deriva del libro mayor, igual que Pagos
 * deriva su `isPaidThisMonth`.
 */
const deuda = (currentBalance: number, dueDay: number) => ({ currentBalance, dueDay });
const DIA_30 = new Date(2026, 8, 30); // 30 de septiembre

describe('isDebtOverdue', () => {
  it('el dia paso y no hay abono: atrasada', () => {
    expect(isDebtOverdue(deuda(973.48, 24), 0, DIA_30)).toBe(true);
  });

  it('el dia paso pero ya se abono: al dia', () => {
    // Sin esta condicion, las cinco tarjetas con saldo parpadearian el mes
    // entero, y un aviso siempre encendido no avisa de nada.
    expect(isDebtOverdue(deuda(973.48, 24), 158, DIA_30)).toBe(false);
  });

  it('el dia todavia no llega: no es atraso, es futuro', () => {
    expect(isDebtOverdue(deuda(973.48, 24), 0, new Date(2026, 8, 10))).toBe(false);
  });

  it('justo EL dia de vencimiento no cuenta como atraso', () => {
    expect(isDebtOverdue(deuda(973.48, 24), 0, new Date(2026, 8, 24))).toBe(false);
    expect(isDebtOverdue(deuda(973.48, 24), 0, new Date(2026, 8, 25))).toBe(true);
  });

  it('una deuda liquidada nunca esta atrasada', () => {
    expect(isDebtOverdue(deuda(0, 1), 0, DIA_30)).toBe(false);
  });

  it('un vencimiento el 31 se recorta a los dias del mes', () => {
    // Sin recortarlo, esta deuda no se atrasaria JAMAS en febrero: el 31 no
    // llega nunca.
    expect(isDebtOverdue(deuda(500, 31), 0, new Date(2026, 1, 27))).toBe(false);
    expect(isDebtOverdue(deuda(500, 31), 0, new Date(2026, 1, 28))).toBe(false);
    expect(isDebtOverdue(deuda(500, 31), 0, new Date(2026, 0, 31))).toBe(false);
  });

  it('cifras corruptas no encienden el aviso', () => {
    expect(isDebtOverdue(deuda(Number.NaN, 24), 0, DIA_30)).toBe(false);
    expect(isDebtOverdue(deuda(-100, 24), 0, DIA_30)).toBe(false);
  });
});
