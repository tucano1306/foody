import { describe, expect, it } from 'vitest';
import {
  isDueInMonth,
  monthlyCost,
  monthsPerCycle,
  nextDueMonth,
  normalizeAnchorMonth,
  normalizeFrequency,
} from './payment-frequency';

/**
 * El caso real: un seguro de coche que se paga cada 6 meses.
 *
 * Antes no tenía sitio en la app. Con la prima entera, el plan creía que ese
 * dinero salía todos los meses; con la prima partida entre seis, la cuenta
 * cuadraba pero los meses sin cobro se acumulaban como atrasos.
 */
describe('monthlyCost — lo que un recibo cuesta al mes', () => {
  it('un seguro de $900 cada seis meses cuesta $150 al mes', () => {
    expect(monthlyCost(900, 'semiannual')).toBe(150);
  });

  it('lo mensual se queda igual', () => {
    expect(monthlyCost(551, 'monthly')).toBe(551);
  });

  it('reparte el resto de frecuencias', () => {
    expect(monthlyCost(1200, 'annual')).toBe(100);
    expect(monthlyCost(300, 'quarterly')).toBe(100);
    expect(monthlyCost(200, 'bimonthly')).toBe(100);
  });

  it('redondea a céntimos', () => {
    expect(monthlyCost(100, 'quarterly')).toBe(33.33);
  });

  it('sin importe no hay coste', () => {
    expect(monthlyCost(0, 'semiannual')).toBe(0);
    expect(monthlyCost(-50, 'monthly')).toBe(0);
    expect(monthlyCost(Number.NaN, 'monthly')).toBe(0);
  });
});

describe('isDueInMonth — en qué meses toca pagar', () => {
  it('un semestral anclado en marzo vence en marzo y septiembre', () => {
    const vence = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
      isDueInMonth('semiannual', 3, m),
    );
    expect(vence).toEqual([3, 9]);
  });

  it('un anual solo vence en su mes', () => {
    const vence = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
      isDueInMonth('annual', 11, m),
    );
    expect(vence).toEqual([11]);
  });

  it('un trimestral vence cuatro veces al año', () => {
    const vence = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) =>
      isDueInMonth('quarterly', 2, m),
    );
    expect(vence).toEqual([2, 5, 8, 11]);
  });

  it('lo mensual vence siempre, sin importar el anclaje', () => {
    expect(isDueInMonth('monthly', null, 7)).toBe(true);
    expect(isDueInMonth('monthly', 3, 7)).toBe(true);
  });

  it('el calendario no se desplaza al cruzar el año', () => {
    // Anclado en noviembre: el siguiente cae en mayo, ya del año siguiente.
    expect(isDueInMonth('semiannual', 11, 11)).toBe(true);
    expect(isDueInMonth('semiannual', 11, 5)).toBe(true);
    expect(isDueInMonth('semiannual', 11, 12)).toBe(false);
  });
});

describe('nextDueMonth', () => {
  it('si toca este mes, es este mes', () => {
    expect(nextDueMonth('semiannual', 3, 3)).toEqual({ month: 3, monthsAhead: 0 });
  });

  it('dice cuántos meses faltan', () => {
    expect(nextDueMonth('semiannual', 3, 4)).toEqual({ month: 9, monthsAhead: 5 });
    expect(nextDueMonth('annual', 1, 2)).toEqual({ month: 1, monthsAhead: 11 });
  });

  it('lo mensual siempre es ahora', () => {
    expect(nextDueMonth('monthly', null, 8)).toEqual({ month: 8, monthsAhead: 0 });
  });
});

describe('normalizeFrequency', () => {
  it('acepta las válidas', () => {
    expect(normalizeFrequency('semiannual')).toBe('semiannual');
  });

  it('cualquier otra cosa cae en mensual', () => {
    // Lo que ya está guardado no tiene frecuencia: era todo mensual.
    expect(normalizeFrequency(undefined)).toBe('monthly');
    expect(normalizeFrequency(null)).toBe('monthly');
    expect(normalizeFrequency('cada rato')).toBe('monthly');
    expect(normalizeFrequency(6)).toBe('monthly');
  });
});

describe('normalizeAnchorMonth', () => {
  it('lo mensual no necesita anclaje', () => {
    expect(normalizeAnchorMonth(5, 'monthly')).toBeNull();
  });

  it('respeta un mes válido', () => {
    expect(normalizeAnchorMonth(9, 'semiannual')).toBe(9);
  });

  it('lo que no es un mes cae en enero, no en vacío', () => {
    // Un recibo sin anclaje no sabría nunca cuándo vence.
    expect(normalizeAnchorMonth(0, 'semiannual')).toBe(1);
    expect(normalizeAnchorMonth(13, 'annual')).toBe(1);
    expect(normalizeAnchorMonth(undefined, 'annual')).toBe(1);
  });
});

describe('monthsPerCycle', () => {
  it('todas dividen a 12, que es lo que fija el calendario', () => {
    for (const f of ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const) {
      expect(12 % monthsPerCycle(f)).toBe(0);
    }
  });
})
