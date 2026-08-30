import { describe, expect, it } from 'vitest';
import {
  cycleFromDate,
  isDueInMonth,
  monthlyCost,
  monthsPerCycle,
  nextDueMonth,
  nextDueOn,
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

/**
 * El caso de Geico, tal como lo cuenta su dueño: «la cobertura empezó el
 * 14/04/2026 y vence el 14/10/2026».
 *
 * Pedir «día del mes» y «mes» por separado dejó el día en 1 y el mes en agosto
 * —el mes en que se editó—, así que la app reclamaba el cobro en un mes en que
 * no toca. De una fecha salen los dos, y no se pueden desajustar.
 */
describe('cycleFromDate — el ciclo sale de una fecha', () => {
  it('del 14 de octubre saca día 14 y mes 10', () => {
    expect(cycleFromDate('2026-10-14')).toEqual({ dueDay: 14, anchorMonth: 10 });
  });

  it('no se va un día por la zona horaria', () => {
    // `new Date('2026-10-14')` es medianoche UTC y en América cae el día 13.
    expect(cycleFromDate('2026-10-14')?.dueDay).toBe(14);
    expect(cycleFromDate('2026-01-01')).toEqual({ dueDay: 1, anchorMonth: 1 });
  });

  it('acepta una fecha ya hecha', () => {
    expect(cycleFromDate(new Date(2026, 3, 14))).toEqual({ dueDay: 14, anchorMonth: 4 });
  });

  it('sin fecha no hay ciclo', () => {
    expect(cycleFromDate('')).toBeNull();
    expect(cycleFromDate(null)).toBeNull();
    expect(cycleFromDate('no es fecha')).toBeNull();
  });
});

describe('nextDueOn — cuándo toca el próximo cobro', () => {
  it('el seguro de abril: en agosto, el siguiente es en octubre', () => {
    // Justo lo que el usuario esperaba ver y no veía.
    const proximo = nextDueOn('semiannual', 4, 14, new Date(2026, 7, 26));
    expect(proximo.getFullYear()).toBe(2026);
    expect(proximo.getMonth() + 1).toBe(10);
    expect(proximo.getDate()).toBe(14);
  });

  it('en el mes de cobro pero antes del día, es este mes', () => {
    const proximo = nextDueOn('semiannual', 4, 14, new Date(2026, 9, 2));
    expect(proximo.getMonth() + 1).toBe(10);
  });

  it('pasado el día, salta al siguiente ciclo y cambia de año', () => {
    const proximo = nextDueOn('semiannual', 4, 14, new Date(2026, 9, 20));
    expect(proximo.getFullYear()).toBe(2027);
    expect(proximo.getMonth() + 1).toBe(4);
  });

  it('un mensual salta al mes siguiente en cuanto pasa el día', () => {
    const proximo = nextDueOn('monthly', null, 3, new Date(2026, 7, 10));
    expect(proximo.getMonth() + 1).toBe(9);
    expect(proximo.getDate()).toBe(3);
  });

  it('recorta el día a los que tiene el mes', () => {
    // Un cobro el 31 en un febrero no existe: cae el último día.
    const proximo = nextDueOn('monthly', null, 31, new Date(2026, 1, 1));
    expect(proximo.getMonth() + 1).toBe(2);
    expect(proximo.getDate()).toBe(28);
  });
})
