import { describe, it, expect } from 'vitest';
import { diffPlans, monthsBetween, topPlanChange, type PlanSnapshot } from './plan-diff';
import type { GoalProjection } from './finance-engine';

function goal(over: Partial<GoalProjection> = {}): GoalProjection {
  return {
    goalId: 'g1',
    name: 'Viaje a Argentina',
    emoji: '✈️',
    kind: 'trip',
    priority: 1,
    targetAmount: 2400,
    savedAmount: 400,
    remaining: 2000,
    percentComplete: 16.7,
    targetDate: '2027-01-15',
    daysLeft: 150,
    monthsLeft: 5,
    requiredMonthly: 400,
    requiredWeekly: 93,
    requiredDaily: 13,
    allocatedMonthly: 400,
    shortfallMonthly: 0,
    projectedDate: '2026-12-22',
    monthsLate: 0,
    feasibility: 'on_track',
    status: 'active',
    ...over,
  };
}

function snap(goals: GoalProjection[], available = 500): PlanSnapshot {
  return { goals, cashFlow: { available, goalsBudget: available } };
}

describe('monthsBetween', () => {
  it('cuenta meses de calendario, con signo', () => {
    expect(monthsBetween('2026-08-01', '2026-11-01')).toBe(3);
    expect(monthsBetween('2026-11-01', '2026-08-01')).toBe(-3);
    expect(monthsBetween('2026-12-01', '2027-02-01')).toBe(2);
    expect(monthsBetween('2026-08-05', '2026-08-28')).toBe(0);
  });

  it('no revienta con fechas inválidas', () => {
    expect(monthsBetween('mañana', '2026-08-01')).toBe(0);
    expect(monthsBetween('', '')).toBe(0);
  });
});

describe('diffPlans', () => {
  it('no dice nada cuando nada cambió', () => {
    const s = snap([goal()]);
    expect(diffPlans(s, s)).toEqual([]);
    expect(topPlanChange(s, s)).toBeNull();
  });

  it('celebra una meta que se adelanta', () => {
    const c = topPlanChange(
      snap([goal({ projectedDate: '2026-12-22' })]),
      snap([goal({ projectedDate: '2026-10-22' })]),
    );
    expect(c?.tone).toBe('good');
    expect(c?.message).toContain('se adelanta 2 meses');
  });

  it('avisa de una meta que se retrasa', () => {
    const c = topPlanChange(
      snap([goal({ projectedDate: '2026-10-22' })]),
      snap([goal({ projectedDate: '2026-11-22' })]),
    );
    expect(c?.tone).toBe('warning');
    expect(c?.message).toContain('se retrasa 1 mes');
  });

  it('ignora movimientos de días: solo importa el mes', () => {
    const c = topPlanChange(
      snap([goal({ projectedDate: '2026-10-02' })]),
      snap([goal({ projectedDate: '2026-10-28' })]),
    );
    expect(c).toBeNull();
  });

  it('una meta cubierta manda sobre cualquier otra cosa', () => {
    const c = topPlanChange(
      snap([goal()]),
      snap([goal({ remaining: 0, projectedDate: '2027-06-01' })]),
    );
    expect(c?.message).toContain('ya está cubierta');
    expect(c?.tone).toBe('good');
  });

  it('avisa cuando una meta deja de llegar a tiempo', () => {
    const c = topPlanChange(
      snap([goal({ feasibility: 'on_track' })]),
      snap([goal({ feasibility: 'at_risk', shortfallMonthly: 120 })]),
    );
    expect(c?.tone).toBe('warning');
    expect(c?.message).toContain('ya no llega a tiempo');
    expect(c?.message).toContain('$120');
  });

  it('celebra cuando vuelve a llegar', () => {
    const c = topPlanChange(
      snap([goal({ feasibility: 'at_risk' })]),
      snap([goal({ feasibility: 'on_track' })]),
    );
    expect(c?.tone).toBe('good');
    expect(c?.message).toContain('vuelve a llegar a tiempo');
  });

  it('las malas noticias pesan más que las buenas', () => {
    // Registrar un ingreso puede adelantar una meta y hundir otra: hay que
    // contar la que duele, no la que gusta.
    const before = snap([
      goal({ goalId: 'a', name: 'Viaje', projectedDate: '2026-12-01' }),
      goal({ goalId: 'b', name: 'Coche', feasibility: 'on_track' }),
    ]);
    const after = snap([
      goal({ goalId: 'a', name: 'Viaje', projectedDate: '2026-11-01' }),
      goal({ goalId: 'b', name: 'Coche', feasibility: 'at_risk', shortfallMonthly: 90 }),
    ]);
    expect(topPlanChange(before, after)?.message).toContain('Coche');
  });

  it('anuncia una meta que por fin tiene ritmo', () => {
    const c = topPlanChange(
      snap([goal({ projectedDate: null, allocatedMonthly: 0 })]),
      snap([goal({ projectedDate: '2027-02-01', allocatedMonthly: 250 })]),
    );
    expect(c?.message).toContain('ya tiene ritmo');
    expect(c?.message).toContain('$250');
  });

  it('cae al dinero libre cuando ninguna meta se movió', () => {
    const c = topPlanChange(snap([goal()], 400), snap([goal()], 550));
    expect(c?.tone).toBe('good');
    expect(c?.message).toContain('$150');
  });

  it('y también cuando el mes se aprieta', () => {
    const c = topPlanChange(snap([goal()], 400), snap([goal()], 320));
    expect(c?.tone).toBe('info');
    expect(c?.message).toContain('$80');
  });

  it('calla ante centavos de diferencia', () => {
    expect(topPlanChange(snap([goal()], 400), snap([goal()], 400.4))).toBeNull();
  });

  it('ignora metas pausadas o logradas', () => {
    const c = topPlanChange(
      snap([goal({ status: 'paused', projectedDate: '2026-12-01' })], 400),
      snap([goal({ status: 'paused', projectedDate: '2026-08-01' })], 400),
    );
    expect(c).toBeNull();
  });

  it('ignora metas nuevas que no existían antes', () => {
    // Crear una meta no es "un cambio en tus metas": el usuario acaba de
    // crearla y ya sabe que existe.
    const c = topPlanChange(snap([], 400), snap([goal()], 400));
    expect(c).toBeNull();
  });

  it('sin plan previo no inventa noticias', () => {
    expect(diffPlans(snap([], 0), snap([], 0))).toEqual([]);
  });
});
