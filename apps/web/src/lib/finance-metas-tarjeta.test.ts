import { describe, expect, it } from 'vitest';
import { buildFinancePlan, type CreditInput, type FinanceGoal, type IncomeSource, type PlanInput } from './finance-engine';

/**
 * El Plan del dueño el 24–25 oct 2026, con sus dos metas de la tarjeta 3650:
 *
 * - «$24,867.44 al mes» para $817 que faltaban al día siguiente: se dividía
 *   entre 1/30 de mes.
 * - La meta de $11,440 pedía $3,642 al mes, y la MISMA deuda ya restaba
 *   $2,860 de cuota en «Libre al mes»: unos $6,500 al mes por una deuda.
 */
const HOY = new Date(2026, 9, 24, 12); // 24 oct 2026

function meta(over: Partial<FinanceGoal>): FinanceGoal {
  return {
    id: 'g',
    name: 'tarjeta 3650 cash rewards',
    emoji: '💳',
    kind: 'debt',
    targetAmount: 1014,
    savedAmount: 197,
    targetDate: '2026-10-25',
    priority: 1,
    monthlyOverride: null,
    status: 'active',
    note: null,
    createdAt: '2026-08-18',
    ...over,
  };
}

const unlimited: CreditInput = {
  id: 'unlimited-3650',
  name: 'Unlimited Cash 3650',
  balance: 11440,
  installment: 2860,
  monthlyInterest: 0,
  monthsToPayoff: 4,
  neverPaysOff: false,
};

const sueldo: IncomeSource = { id: 'i', name: 'Sueldo', amount: 8000, frequency: 'monthly', isActive: true, note: null };

function plan(over: Partial<PlanInput>): PlanInput {
  return {
    incomes: [sueldo],
    goals: [],
    fixedPayments: [],
    groceriesMonthly: 0,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 0,
    now: HOY,
    ...over,
  };
}

describe('menos de un mes por delante', () => {
  it('lo que falta se necesita entero, no multiplicado por 30', () => {
    const [g] = buildFinancePlan(plan({ goals: [meta({})] })).goals;
    expect(g.daysLeft).toBe(1);
    expect(g.requiredMonthly).toBe(817);
  });

  it('el mismo día de la fecha todavía no está vencida', () => {
    const [g] = buildFinancePlan(plan({ goals: [meta({})], now: new Date(2026, 9, 25, 9) })).goals;
    expect(g.daysLeft).toBe(0);
    expect(g.feasibility).not.toBe('overdue');
    expect(g.requiredMonthly).toBe(817);
  });

  it('al día siguiente, sí', () => {
    const [g] = buildFinancePlan(plan({ goals: [meta({})], now: new Date(2026, 9, 26, 9) })).goals;
    expect(g.feasibility).toBe('overdue');
  });

  it('con más de un mes, sigue repartiéndose por meses', () => {
    const [g] = buildFinancePlan(plan({ goals: [meta({ targetAmount: 11440, savedAmount: 313, targetDate: '2027-01-25' })] })).goals;
    expect(g.requiredMonthly).toBeGreaterThan(3000);
    expect(g.requiredMonthly).toBeLessThan(4000);
  });
});

describe('una meta enlazada a una tarjeta se paga con la cuota de la tarjeta', () => {
  const enlazada = meta({ id: 'ene', debtId: 'unlimited-3650', targetAmount: 11440, savedAmount: 0, targetDate: '2027-02-28' });
  const viaje = meta({ id: 'viaje', name: 'Viaje', kind: 'trip', debtId: null, targetAmount: 1200, savedAmount: 0, targetDate: '2027-04-30', priority: 2 });

  it('la cuota es su aporte y no come del dinero libre', () => {
    const p = buildFinancePlan(plan({ goals: [enlazada, viaje], credits: [unlimited] }));
    const ene = p.goals.find((g) => g.goalId === 'ene')!;
    expect(ene.cuotaTarjeta).toBe(2860);
    expect(ene.allocatedMonthly).toBe(2860);
    // El viaje recibe lo suyo: el dinero libre no se lo llevó la tarjeta otra vez.
    const v = p.goals.find((g) => g.goalId === 'viaje')!;
    expect(v.allocatedMonthly).toBe(v.requiredMonthly);
    // Lo que va a metas desde el dinero libre no cuenta la cuota, que ya restó el crédito.
    expect(p.cashFlow.allocatedToGoals).toBe(v.allocatedMonthly);
    expect(p.cashFlow.creditPayments).toBe(2860);
  });

  it('si la cuota alcanza para la fecha, va a tiempo', () => {
    const [g] = buildFinancePlan(plan({ goals: [enlazada], credits: [unlimited] })).goals;
    expect(g.requiredMonthly).toBeLessThanOrEqual(2860);
    expect(g.feasibility).toBe('on_track');
    expect(g.shortfallMonthly).toBe(0);
  });

  it('si no alcanza, lo dice con la cuota de la tarjeta, no con «el plan le aparta»', () => {
    const corta = { ...enlazada, targetDate: '2027-01-25' };
    const p = buildFinancePlan(plan({ goals: [corta], credits: [unlimited] }));
    const [g] = p.goals;
    expect(g.feasibility).toBe('at_risk');
    expect(g.shortfallMonthly).toBeGreaterThan(0);
    const consejo = p.advice.find((a) => a.title.includes('la cuota no llega'));
    expect(consejo?.body).toContain('La cuota de la tarjeta es de $2,860');
  });

  it('sin enlazar, sigue pidiendo su propio aporte (y la página ofrece enlazarla)', () => {
    const [g] = buildFinancePlan(plan({ goals: [{ ...enlazada, debtId: null }], credits: [unlimited] })).goals;
    expect(g.cuotaTarjeta).toBeNull();
  });
});
