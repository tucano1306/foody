import { describe, it, expect } from 'vitest';
import { computeExpenseImpact, daysDelayedBy, levelFor, monthsAdvancedBy } from './goal-impact';
import type { GoalProjection } from './finance-engine';

function goal(over: Partial<GoalProjection> = {}): GoalProjection {
  return {
    goalId: 'g1',
    name: 'Viaje a Argentina',
    emoji: '✈️',
    kind: 'trip',
    priority: 1,
    targetAmount: 2300,
    savedAmount: 200,
    remaining: 2100,
    percentComplete: 8.7,
    targetDate: '2026-10-15',
    daysLeft: 75,
    monthsLeft: 2.46,
    requiredMonthly: 853,
    requiredWeekly: 196,
    requiredDaily: 28,
    allocatedMonthly: 600,
    shortfallMonthly: 253,
    projectedDate: null,
    monthsLate: 0,
    feasibility: 'at_risk',
    status: 'active',
    ...over,
  };
}

describe('daysDelayedBy', () => {
  it('convierte el gasto en días según el ritmo de la meta', () => {
    // $600/mes ≈ $19.71/día → $200 son ~10 días
    expect(daysDelayedBy(200, 600)).toBeCloseTo(10.1, 0);
  });

  it('cuanto menor es el aporte mensual, más caro sale el mismo gasto', () => {
    expect(daysDelayedBy(100, 200)).toBeGreaterThan(daysDelayedBy(100, 800));
  });

  it('no inventa retraso sin ritmo asignado (nada de dividir por cero)', () => {
    expect(daysDelayedBy(500, 0)).toBe(0);
    expect(Number.isFinite(daysDelayedBy(500, 0))).toBe(true);
  });

  it('una devolución o un gasto de cero no retrasa nada', () => {
    expect(daysDelayedBy(0, 600)).toBe(0);
    expect(daysDelayedBy(-80, 600)).toBe(0);
  });
});

describe('levelFor', () => {
  it('escala con la parte del aporte mensual que se llevó el gasto', () => {
    expect(levelFor(0.6)).toBe('high');
    expect(levelFor(0.3)).toBe('medium');
    expect(levelFor(0.1)).toBe('low');
    expect(levelFor(0.01)).toBe('none');
  });

  it('un gasto que supera el aporte entero es siempre grave', () => {
    expect(levelFor(2.5)).toBe('high');
  });
});

describe('computeExpenseImpact — casos normales', () => {
  it('traduce el gasto a días de retraso con mensaje listo', () => {
    const r = computeExpenseImpact({ amount: 200, goals: [goal()] });
    expect(r.worst?.daysDelayed).toBeCloseTo(10.1, 0);
    expect(r.worst?.level).toBe('medium');
    expect(r.worst?.message).toContain('Viaje a Argentina');
    expect(r.worst?.message).toMatch(/10 días/);
  });

  it('reparte el golpe entre varias metas según lo que recibe cada una', () => {
    const r = computeExpenseImpact({
      amount: 300,
      goals: [
        goal({ goalId: 'a', name: 'Viaje', allocatedMonthly: 600 }),
        goal({ goalId: 'b', name: 'Laptop', allocatedMonthly: 200 }),
      ],
    });
    expect(r.impacts).toHaveLength(2);
    // 600/800 del golpe a la primera, 200/800 a la segunda; ambas pierden la
    // misma proporción de su ritmo, así que se retrasan lo mismo.
    expect(r.impacts[0].shareOfMonthly).toBeCloseTo(r.impacts[1].shareOfMonthly, 1);
    expect(r.totalDaysDelayed).toBeGreaterThan(0);
  });

  it('ordena de mayor a menor retraso', () => {
    const r = computeExpenseImpact({
      amount: 400,
      goals: [
        goal({ goalId: 'a', name: 'Grande', allocatedMonthly: 800 }),
        goal({ goalId: 'b', name: 'Chica', allocatedMonthly: 100 }),
      ],
    });
    expect(r.impacts[0].daysDelayed).toBeGreaterThanOrEqual(r.impacts[1].daysDelayed);
    expect(r.worst).toBe(r.impacts[0]);
  });
});

describe('computeExpenseImpact — el colchón amortigua', () => {
  it('un gasto que cabe en el dinero sin asignar no toca las metas', () => {
    const r = computeExpenseImpact({ amount: 150, goals: [goal()], unallocatedMonthly: 200 });
    expect(r.impacts).toEqual([]);
    expect(r.worst).toBeNull();
    expect(r.totalDaysDelayed).toBe(0);
  });

  it('solo lo que excede el colchón sale del ritmo de las metas', () => {
    const conColchon = computeExpenseImpact({ amount: 300, goals: [goal()], unallocatedMonthly: 100 });
    const sinColchon = computeExpenseImpact({ amount: 200, goals: [goal()] });
    // 300 − 100 de colchón equivale a un gasto pelado de 200
    expect(conColchon.worst?.daysDelayed).toBeCloseTo(sinColchon.worst?.daysDelayed ?? 0, 1);
  });

  it('un colchón negativo o ausente no rompe el cálculo', () => {
    const r = computeExpenseImpact({ amount: 200, goals: [goal()], unallocatedMonthly: -50 });
    expect(r.worst?.daysDelayed).toBeGreaterThan(0);
  });
});

describe('computeExpenseImpact — escenarios límite', () => {
  it.each([[0], [-100], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'devuelve vacío ante un monto inválido (%s)',
    (amount) => {
      const r = computeExpenseImpact({ amount, goals: [goal()] });
      expect(r.impacts).toEqual([]);
      expect(r.worst).toBeNull();
    },
  );

  it('ignora metas pausadas, logradas y sin ritmo', () => {
    const r = computeExpenseImpact({
      amount: 200,
      goals: [
        goal({ goalId: 'p', status: 'paused' }),
        goal({ goalId: 'd', remaining: 0 }),
        goal({ goalId: 'z', allocatedMonthly: 0 }),
      ],
    });
    expect(r.impacts).toEqual([]);
  });

  it('sin metas no falla ni inventa avisos', () => {
    const r = computeExpenseImpact({ amount: 500, goals: [] });
    expect(r).toEqual({ impacts: [], worst: null, totalDaysDelayed: 0 });
  });

  it('un gasto mayor que la meta entera da un retraso grande pero finito', () => {
    const r = computeExpenseImpact({ amount: 5000, goals: [goal()] });
    expect(r.worst?.level).toBe('high');
    expect(Number.isFinite(r.worst?.daysDelayed ?? Number.NaN)).toBe(true);
  });

  it('funciona con metas sin fecha límite', () => {
    const r = computeExpenseImpact({ amount: 200, goals: [goal({ targetDate: null, daysLeft: null })] });
    expect(r.worst?.daysDelayed).toBeGreaterThan(0);
    expect(r.worst?.message).toContain('tu ritmo actual');
  });

  it('un retraso menor a un día se dice sin números falsos', () => {
    const r = computeExpenseImpact({ amount: 5, goals: [goal({ allocatedMonthly: 900 })] });
    expect(r.worst?.message).toContain('menos de un día');
  });
});

describe('monthsAdvancedBy', () => {
  it('mide cuánto adelanta un aporte extra', () => {
    // 2100 restantes a 600/mes = 4 meses; a 1200/mes = 2 meses
    expect(monthsAdvancedBy(goal(), 600)).toBe(2);
  });

  it('no adelanta nada sin aporte, sin ritmo o con la meta cubierta', () => {
    expect(monthsAdvancedBy(goal(), 0)).toBe(0);
    expect(monthsAdvancedBy(goal({ allocatedMonthly: 0 }), 500)).toBe(0);
    expect(monthsAdvancedBy(goal({ remaining: 0 }), 500)).toBe(0);
  });
});
