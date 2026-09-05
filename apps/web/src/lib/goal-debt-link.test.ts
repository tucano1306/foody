import { describe, expect, it } from 'vitest';
import { goalWithDebt, type FinanceGoal } from './finance-engine';

/**
 * Las metas y las deudas eran DOS COPIAS del mismo dinero, cada una con su
 * numero escrito a mano. En datos reales ya habian derivado:
 *
 *   meta  «tarjeta 3650 cash rewards»  objetivo $11,440.00  llevas $157.00
 *   deuda «Unlimited Cash 3650»        original $11,440.00  abonado $0.00
 *
 *   meta  «tarjeta 3650 cash rewards»  objetivo  $1,014.00  llevas  $41.00
 *   deuda «Compras 3650»               original  $1,026.54  abonado $53.06
 *
 * Ninguna cifra era falsa cuando se escribio: faltaba que una siguiera a la
 * otra.
 */
function meta(over: Partial<FinanceGoal> = {}): FinanceGoal {
  return {
    id: 'g1', name: 'tarjeta 3650 cash rewards', emoji: '💳', kind: 'debt',
    targetAmount: 11_440, savedAmount: 157, targetDate: '2027-01-25',
    priority: 1, monthlyOverride: null, status: 'active', note: null,
    createdAt: '2026-08-01T00:00:00.000Z', ...over,
  };
}

describe('goalWithDebt — la meta lee sus cifras de la tarjeta', () => {
  it('sin enganche no toca nada: la meta sigue siendo del usuario', () => {
    const g = meta({ debtId: null });
    expect(goalWithDebt(g, { originalAmount: 999, currentBalance: 1 })).toBe(g);
  });

  it('enganchada pero sin la deuda a mano, tampoco inventa', () => {
    const g = meta({ debtId: 'd1' });
    expect(goalWithDebt(g, null)).toBe(g);
  });

  it('el caso real: la meta decia $157 abonados sobre una tarjeta intacta', () => {
    const g = goalWithDebt(meta({ debtId: 'd1' }), {
      originalAmount: 11_440, currentBalance: 11_440,
    });
    expect(g.targetAmount).toBe(11_440);
    expect(g.savedAmount).toBe(0);
  });

  it('el otro caso real: objetivo y abonado cuadran con la deuda', () => {
    const g = goalWithDebt(meta({ debtId: 'd2', targetAmount: 1014, savedAmount: 41 }), {
      originalAmount: 1026.54, currentBalance: 973.48,
    });
    expect(g.targetAmount).toBe(1026.54);
    expect(g.savedAmount).toBe(53.06);
    expect(g.targetAmount - g.savedAmount).toBeCloseTo(973.48, 2);
  });

  it('abonar la tarjeta mueve la meta sin tocarla', () => {
    const antes = goalWithDebt(meta({ debtId: 'd1' }), { originalAmount: 1000, currentBalance: 1000 });
    const despues = goalWithDebt(meta({ debtId: 'd1' }), { originalAmount: 1000, currentBalance: 700 });
    expect(antes.savedAmount).toBe(0);
    expect(despues.savedAmount).toBe(300);
  });

  it('un consumo nuevo la mueve al reves, y el objetivo CRECE con la deuda', () => {
    // Sin esto, «llevas abonado» saldria negativo y el objetivo seria menor
    // que lo que falta: la meta se leeria como cumplida debiendo mas que nunca.
    const g = goalWithDebt(meta({ debtId: 'd1' }), { originalAmount: 1000, currentBalance: 1200 });
    expect(g.targetAmount).toBe(1200);
    expect(g.savedAmount).toBe(0);
  });

  it('una tarjeta liquidada deja la meta cumplida', () => {
    const g = goalWithDebt(meta({ debtId: 'd1' }), { originalAmount: 2301.42, currentBalance: 0 });
    expect(g.savedAmount).toBe(2301.42);
    expect(g.targetAmount).toBe(2301.42);
  });

  it('cifras corruptas no propagan basura', () => {
    const g = goalWithDebt(meta({ debtId: 'd1' }), {
      originalAmount: Number.NaN, currentBalance: -50,
    });
    expect(g.targetAmount).toBe(0);
    expect(g.savedAmount).toBe(0);
  });
});
