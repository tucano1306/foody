import { describe, expect, it } from 'vitest';
import { decisionCron } from './cron-pagos';

const el = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0, 0);

/**
 * Un seguro de $515 cada 6 meses, cobrado el 14, con los cobros en octubre y
 * abril. Antes de esto, el cron lo habría registrado como pagado —y mandado a
 * Computo— el 14 de cada mes.
 */
const SEGURO = { due_day: 14, frequency: 'semiannual', anchor_month: 10 };

describe('decisionCron — recibos que no son mensuales', () => {
  it('el día de cobro de un mes que toca, se cobra', () => {
    expect(decisionCron(SEGURO, el(2026, 10, 14)).tocaCobrarHoy).toBe(true);
    expect(decisionCron(SEGURO, el(2027, 4, 14)).tocaCobrarHoy).toBe(true);
  });

  it('el mismo día de un mes que no toca, NO se cobra', () => {
    expect(decisionCron(SEGURO, el(2026, 11, 14)).tocaCobrarHoy).toBe(false);
    expect(decisionCron(SEGURO, el(2027, 1, 14)).tocaCobrarHoy).toBe(false);
  });

  it('el aviso solo cuando el próximo cobro es de verdad', () => {
    expect(decisionCron(SEGURO, el(2026, 11, 12))).toMatchObject({ dias: 2, vencimientoReal: false });
    expect(decisionCron(SEGURO, el(2027, 4, 12))).toMatchObject({ dias: 2, vencimientoReal: true });
  });

  it('un aviso de fin de mes mira el mes SIGUIENTE, que es cuando cae el cobro', () => {
    const anual = { due_day: 2, frequency: 'annual', anchor_month: 11 };
    // 30 de octubre: el cobro es el 2 de noviembre, mes en que toca.
    expect(decisionCron(anual, el(2026, 10, 30))).toMatchObject({ dias: 3, vencimientoReal: true });
    // 30 de noviembre: el próximo 2 es de diciembre, que no toca.
    expect(decisionCron(anual, el(2026, 11, 30))).toMatchObject({ dias: 2, vencimientoReal: false });
  });

  it('diciembre pasa a enero sin perderse', () => {
    const anual = { due_day: 3, frequency: 'annual', anchor_month: 1 };
    expect(decisionCron(anual, el(2026, 12, 31))).toMatchObject({ dias: 3, vencimientoReal: true });
  });
});

describe('decisionCron — los mensuales siguen igual', () => {
  const RENTA = { due_day: 5, frequency: 'monthly', anchor_month: null };

  it('se cobran todos los meses en su día', () => {
    for (let m = 1; m <= 12; m++) {
      expect(decisionCron(RENTA, el(2026, m, 5)).tocaCobrarHoy).toBe(true);
    }
  });

  it('sin frecuencia guardada (filas viejas) cuenta como mensual', () => {
    expect(decisionCron({ due_day: 5 }, el(2026, 7, 5)).tocaCobrarHoy).toBe(true);
    expect(decisionCron({ due_day: 5 }, el(2026, 7, 3))).toMatchObject({ dias: 2, vencimientoReal: true });
  });
});
