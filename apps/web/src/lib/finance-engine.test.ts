import { describe, it, expect } from 'vitest';
import {
  addMonths,
  buildFinancePlan,
  daysUntil,
  monthlyEquivalent,
  monthsToReach,
  simulatePlan,
  type FinanceGoal,
  type FixedPaymentInput,
  type IncomeSource,
  type PlanInput,
} from './finance-engine';
import { EMPTY_GROCERY_INSIGHT, type GroceryInsight } from './grocery-insights';

const NOW = new Date(2026, 6, 22, 12, 0, 0); // 22 jul 2026

function income(over: Partial<IncomeSource> = {}): IncomeSource {
  return { id: 'i1', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null, ...over };
}

function goal(over: Partial<FinanceGoal> = {}): FinanceGoal {
  return {
    id: 'g1',
    name: 'Viaje a Argentina',
    emoji: '✈️',
    kind: 'trip',
    targetAmount: 2300,
    savedAmount: 0,
    targetDate: '2026-10-15',
    priority: 1,
    monthlyOverride: null,
    status: 'active',
    note: null,
    createdAt: NOW.toISOString(),
    ...over,
  };
}

function payment(over: Partial<FixedPaymentInput> = {}): FixedPaymentInput {
  return {
    id: 'p1',
    name: 'Renta',
    amount: 900,
    dueDay: 5,
    isPaidThisMonth: true,
    missedMonths: 0,
    accumulatedDebt: 0,
    ...over,
  };
}

function plan(over: Partial<PlanInput> = {}): PlanInput {
  return {
    incomes: [income()],
    goals: [goal()],
    fixedPayments: [payment()],
    groceriesMonthly: 400,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 180,
    now: NOW,
    ...over,
  };
}

describe('monthlyEquivalent', () => {
  it('normaliza cada frecuencia a un mes', () => {
    expect(monthlyEquivalent(3000, 'monthly')).toBe(3000);
    expect(monthlyEquivalent(1000, 'biweekly')).toBeCloseTo(2166.67, 1);
    expect(monthlyEquivalent(500, 'weekly')).toBeCloseTo(2166.67, 1);
    expect(monthlyEquivalent(12000, 'yearly')).toBe(1000);
  });

  it('ignora entradas de una sola vez y montos inválidos', () => {
    expect(monthlyEquivalent(5000, 'one_time')).toBe(0);
    expect(monthlyEquivalent(-100, 'monthly')).toBe(0);
    expect(monthlyEquivalent(Number.NaN, 'monthly')).toBe(0);
  });
});

describe('daysUntil', () => {
  it('cuenta días completos hasta la fecha objetivo', () => {
    expect(daysUntil('2026-10-15', NOW)).toBe(85);
    expect(daysUntil('2026-07-22', NOW)).toBe(0);
    expect(daysUntil('2026-07-20', NOW)).toBe(-2);
  });

  it('devuelve null si la fecha no es válida', () => {
    expect(daysUntil('mañana', NOW)).toBeNull();
  });
});

describe('monthsToReach / addMonths', () => {
  it('redondea hacia arriba los meses necesarios', () => {
    expect(monthsToReach(2300, 800)).toBe(3);
    expect(monthsToReach(0, 800)).toBe(0);
    expect(monthsToReach(2300, 0)).toBeNull();
  });

  it('no desborda el mes al sumar desde un día 31', () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getMonth()).toBe(1); // febrero
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(28);
  });
});

describe('buildFinancePlan — flujo de caja', () => {
  it('calcula disponible = ingreso − pagos fijos − super', () => {
    const { cashFlow } = buildFinancePlan(plan());
    expect(cashFlow.monthlyIncome).toBe(3000);
    expect(cashFlow.fixedPayments).toBe(900);
    expect(cashFlow.groceriesEstimate).toBe(400);
    expect(cashFlow.available).toBe(1700);
    expect(cashFlow.savingsRate).toBeCloseTo(0.57, 2);
  });

  it('marca déficit cuando los gastos superan el ingreso', () => {
    const result = buildFinancePlan(plan({ incomes: [income({ amount: 1000 })] }));
    expect(result.cashFlow.available).toBe(-300);
    expect(result.advice[0].id).toBe('negative-flow');
    expect(result.advice[0].tone).toBe('critical');
  });

  it('suma varias fuentes de ingreso activas y descarta las inactivas', () => {
    const result = buildFinancePlan(
      plan({
        incomes: [
          income({ id: 'a', amount: 2000 }),
          income({ id: 'b', name: 'Freelance', amount: 600, frequency: 'monthly' }),
          income({ id: 'c', name: 'Renta vieja', amount: 500, isActive: false }),
        ],
      }),
    );
    expect(result.cashFlow.monthlyIncome).toBe(2600);
  });
});

describe('buildFinancePlan — proyección de metas', () => {
  it('reparte el faltante en el tiempo que queda (caso viaje $2300 a octubre)', () => {
    const { goals } = buildFinancePlan(plan());
    const viaje = goals[0];
    expect(viaje.remaining).toBe(2300);
    expect(viaje.daysLeft).toBe(85);
    expect(viaje.requiredMonthly).toBeCloseTo(823.6, 0);
    expect(viaje.requiredWeekly).toBeCloseTo(189.4, 0);
    expect(viaje.requiredDaily).toBeCloseTo(27.06, 1);
    expect(viaje.feasibility).toBe('on_track');
    expect(viaje.shortfallMonthly).toBe(0);
  });

  it('descuenta lo ya ahorrado', () => {
    const { goals } = buildFinancePlan(plan({ goals: [goal({ savedAmount: 800 })] }));
    expect(goals[0].remaining).toBe(1500);
    expect(goals[0].percentComplete).toBeCloseTo(34.78, 1);
  });

  it('marca en riesgo la meta que no cabe en el dinero libre y cuantifica el faltante', () => {
    const result = buildFinancePlan(plan({ incomes: [income({ amount: 1700 })] })); // libre: 400
    const viaje = result.goals[0];
    expect(viaje.feasibility).toBe('at_risk');
    expect(viaje.allocatedMonthly).toBe(400);
    expect(viaje.shortfallMonthly).toBeCloseTo(423.6, 0);
    expect(result.advice.some((a) => a.id === 'goal-risk-g1')).toBe(true);
  });

  it('marca "overdue" cuando la fecha ya pasó y falta dinero', () => {
    const { goals } = buildFinancePlan(plan({ goals: [goal({ targetDate: '2026-06-01' })] }));
    expect(goals[0].feasibility).toBe('overdue');
  });

  it('marca "done" cuando ya se juntó el objetivo', () => {
    const { goals } = buildFinancePlan(plan({ goals: [goal({ savedAmount: 2300 })] }));
    expect(goals[0].feasibility).toBe('done');
    expect(goals[0].remaining).toBe(0);
    expect(goals[0].percentComplete).toBe(100);
  });

  it('usa un horizonte de 12 meses para metas sin fecha', () => {
    const { goals } = buildFinancePlan(plan({ goals: [goal({ targetDate: null })] }));
    expect(goals[0].feasibility).toBe('no_date');
    expect(goals[0].requiredMonthly).toBeCloseTo(191.67, 1);
    expect(goals[0].projectedDate).not.toBeNull();
  });

  it('respeta el aporte mensual fijado a mano', () => {
    const { goals } = buildFinancePlan(plan({ goals: [goal({ targetDate: null, monthlyOverride: 500 })] }));
    expect(goals[0].allocatedMonthly).toBe(500);
  });

  it('no asigna dinero a metas pausadas', () => {
    const { goals, cashFlow } = buildFinancePlan(plan({ goals: [goal({ status: 'paused' })] }));
    expect(goals[0].allocatedMonthly).toBe(0);
    expect(cashFlow.allocatedToGoals).toBe(0);
  });
});

describe('buildFinancePlan — varias metas compitiendo', () => {
  const dos = plan({
    incomes: [income({ amount: 2200 })], // libre: 900
    goals: [
      goal({ id: 'g1', priority: 1 }),
      goal({ id: 'g2', name: 'Laptop', emoji: '💻', kind: 'purchase', targetAmount: 1200, targetDate: '2026-12-31', priority: 2 }),
    ],
  });

  it('sirve primero a la meta de mayor prioridad', () => {
    const { goals, cashFlow } = buildFinancePlan(dos);
    const viaje = goals.find((g) => g.goalId === 'g1');
    const laptop = goals.find((g) => g.goalId === 'g2');
    expect(viaje?.allocatedMonthly).toBeCloseTo(823.6, 0);
    expect(laptop?.allocatedMonthly).toBeCloseTo(76.4, 0);
    expect(laptop?.feasibility).toBe('at_risk');
    expect(cashFlow.unallocated).toBe(0);
  });

  it('nunca reparte más de lo disponible', () => {
    const { cashFlow } = buildFinancePlan(dos);
    expect(cashFlow.allocatedToGoals).toBeLessThanOrEqual(cashFlow.goalsBudget + 0.01);
  });
});

describe('buildFinancePlan — deudas atrasadas', () => {
  const conDeuda = plan({
    fixedPayments: [
      payment({ id: 'p1', name: 'Renta', amount: 900 }),
      payment({ id: 'p2', name: 'Tarjeta', amount: 150, accumulatedDebt: 450, missedMonths: 3, isPaidThisMonth: false }),
      payment({ id: 'p3', name: 'Internet', amount: 60, accumulatedDebt: 120, missedMonths: 2, isPaidThisMonth: false }),
    ],
  });

  it('reserva dinero para ponerse al día antes que las metas', () => {
    const { cashFlow, debts } = buildFinancePlan(conDeuda);
    expect(debts.overdueTotal).toBe(570);
    expect(debts.overdueCount).toBe(2);
    expect(debts.monthlyCatchUp).toBe(190); // 570 / 3 meses
    expect(debts.monthsToClear).toBe(3);
    expect(cashFlow.goalsBudget).toBe(cashFlow.available - 190);
  });

  it('ordena el pago por bola de nieve: la deuda más pequeña primero', () => {
    const { debts } = buildFinancePlan(conDeuda);
    expect(debts.payoffOrder.map((d) => d.name)).toEqual(['Internet', 'Tarjeta']);
  });

  it('no reserva más del 40% del dinero libre', () => {
    const { debts } = buildFinancePlan({
      ...conDeuda,
      incomes: [income({ amount: 1660 })], // 1660 − 1110 fijos − 400 super = 150 libres → tope 60
    });
    expect(debts.monthlyCatchUp).toBeCloseTo(60, 1);
  });

  it('no reserva nada si no hay dinero libre', () => {
    const { debts, cashFlow } = buildFinancePlan({ ...conDeuda, incomes: [income({ amount: 1000 })] });
    expect(cashFlow.available).toBeLessThan(0);
    expect(debts.monthlyCatchUp).toBe(0);
    expect(debts.monthsToClear).toBeNull();
  });

  it('avisa como crítico y propone un plan concreto', () => {
    const { advice } = buildFinancePlan(conDeuda);
    const deuda = advice.find((a) => a.id === 'overdue-debt');
    expect(deuda?.tone).toBe('critical');
    expect(deuda?.body).toContain('3 meses');
    expect(advice.some((a) => a.id === 'snowball-order')).toBe(true);
  });
});

describe('buildFinancePlan — consejos', () => {
  it('pide ingresos cuando no hay ninguno', () => {
    const { advice } = buildFinancePlan(plan({ incomes: [] }));
    expect(advice[0].id).toBe('no-income');
    expect(advice[0].action?.kind).toBe('add_income');
  });

  it('invita a crear la primera meta', () => {
    const { advice } = buildFinancePlan(plan({ goals: [] }));
    expect(advice.some((a) => a.id === 'no-goals')).toBe(true);
  });

  it('ordena los consejos por gravedad', () => {
    const { advice } = buildFinancePlan(
      plan({
        incomes: [income({ amount: 1700 })],
        fixedPayments: [payment({ accumulatedDebt: 900, missedMonths: 1 })],
      }),
    );
    const tones = advice.map((a) => a.tone);
    expect(tones[0]).toBe('critical');
    expect(tones).toEqual([...tones].sort((a, b) => {
      const w = { critical: 0, warning: 1, idea: 2, good: 3, info: 4 } as const;
      return w[a] - w[b];
    }));
  });

  it('propone destino para el sobrante mensual', () => {
    const { advice, cashFlow } = buildFinancePlan(plan());
    expect(cashFlow.unallocated).toBeGreaterThan(0);
    expect(advice.some((a) => a.id === 'surplus-boost')).toBe(true);
  });
});

describe('buildFinancePlan — consejos desde las compras reales', () => {
  /** Insight de super con lo mínimo para disparar cada regla. */
  function insight(over: Partial<GroceryInsight> = {}): GroceryInsight {
    return {
      ...EMPTY_GROCERY_INSIGHT,
      spentThisMonth: 420,
      tripsThisMonth: 5,
      daysElapsed: 22,
      daysInMonth: 31,
      dailyPace: 19.09,
      projectedMonthEnd: 592,
      avgMonthly: 550,
      lastMonth: 500,
      monthsWithData: 2,
      limit: 400,
      baseline: 580,
      baselineSource: 'pace',
      overLimit: 192,
      trendPct: 7.6,
      categories: [
        { category: 'carnes', currentMonth: 180, prevMonth: 120, deltaPct: 50, share: 42.9 },
        { category: 'bebidas', currentMonth: 100, prevMonth: 60, deltaPct: 66.7, share: 23.8 },
      ],
      biggestMover: { category: 'carnes', currentMonth: 180, prevMonth: 120, deltaPct: 50, share: 42.9 },
      ...over,
    };
  }

  function conCompras(g: Partial<GroceryInsight>, over: Partial<PlanInput> = {}) {
    const full = insight(g);
    return buildFinancePlan(plan({ groceries: full, groceriesMonthly: full.baseline, groceriesSource: full.baselineSource, groceriesSpentThisMonth: full.spentThisMonth, ...over }));
  }

  it('avisa del ritmo que rebasa el límite con la proyección al cierre', () => {
    const { advice } = conCompras({});
    const pace = advice.find((a) => a.id === 'grocery-pace-over-limit');
    expect(pace?.tone).toBe('warning');
    expect(pace?.body).toContain('$420');   // llevas
    expect(pace?.body).toContain('22 días');
    expect(pace?.body).toContain('$192');   // exceso proyectado
  });

  it('celebra ir por debajo del límite y ofrece aportar el sobrante', () => {
    const { advice } = conCompras({ projectedMonthEnd: 300, overLimit: -100, limit: 400 });
    const under = advice.find((a) => a.id === 'grocery-under-limit');
    expect(under?.tone).toBe('good');
    expect(under?.action?.kind).toBe('contribute');
    expect(under?.body).toContain('$100');
  });

  it('sin metas, el sobrante del super invita a crear una en vez de aportar a la nada', () => {
    const { advice } = conCompras({ projectedMonthEnd: 300, overLimit: -100, limit: 400 }, { goals: [] });
    const under = advice.find((a) => a.id === 'grocery-under-limit');
    expect(under?.action?.kind).toBe('add_goal');
    expect(under?.action?.goalId).toBeUndefined();
  });

  it('detecta el alza contra el promedio y nombra la categoría culpable', () => {
    const { advice } = conCompras({ projectedMonthEnd: 800, avgMonthly: 550, trendPct: 45.5, overLimit: 400 });
    const trend = advice.find((a) => a.id === 'grocery-trend-up');
    expect(trend?.title).toContain('46%');
    expect(trend?.body).toContain('carnes');
    expect(trend?.body).toContain('$250'); // 800 − 550
  });

  it('reconoce el mes en que se gasta menos que el promedio', () => {
    const { advice } = conCompras({ projectedMonthEnd: 300, avgMonthly: 550, trendPct: -45.5, overLimit: -100 });
    const down = advice.find((a) => a.id === 'grocery-trend-down');
    expect(down?.tone).toBe('good');
    expect(down?.body).toContain('$250');
  });

  it('no juzga la tendencia con menos de dos meses de historial', () => {
    const { advice } = conCompras({ monthsWithData: 1, trendPct: 80, projectedMonthEnd: 900 });
    expect(advice.some((a) => a.id.startsWith('grocery-trend'))).toBe(false);
  });

  it('propone recortar la categoría dominante solo si alguna meta lo necesita', () => {
    const holgado = conCompras({});
    expect(holgado.advice.some((a) => a.id === 'grocery-category-lever')).toBe(false);

    const apretado = conCompras({}, { incomes: [income({ amount: 1700 })] });
    const lever = apretado.advice.find((a) => a.id === 'grocery-category-lever');
    expect(lever?.title).toContain('carnes');
    expect(lever?.body).toContain('$27');  // 15% de 180
    expect(lever?.body).toContain('$324'); // al año
    expect(lever?.action?.kind).toBe('open_trips');
  });

  it('señala el exceso de visitas al super cuando las metas van apretadas', () => {
    const { advice } = conCompras({ tripsThisMonth: 10 }, { incomes: [income({ amount: 1700 })] });
    const trips = advice.find((a) => a.id === 'grocery-trip-frequency');
    expect(trips?.body).toContain('$42'); // 420 / 10 por visita
  });

  it('pide registrar compras cuando no hay ninguna', () => {
    const { advice } = conCompras({ spentThisMonth: 0, monthsWithData: 0, categories: [], biggestMover: null });
    expect(advice.some((a) => a.id === 'grocery-no-purchases')).toBe(true);
  });

  it('traduce el ahorro en meses de adelanto de la meta prioritaria', () => {
    // Meta de $2100 restantes con $700/mes asignados → 3 meses; con +$700 → 2.
    const { advice } = conCompras(
      { projectedMonthEnd: 300, overLimit: -700, limit: 1000 },
      { goals: [goal({ targetAmount: 2100, targetDate: null })] },
    );
    const under = advice.find((a) => a.id === 'grocery-under-limit');
    expect(under?.body).toMatch(/adelantas \d+ mes/);
  });
});

describe('healthScore', () => {
  it('es alto con flujo sano, sin deuda y metas a tiempo', () => {
    expect(buildFinancePlan(plan()).healthScore).toBeGreaterThanOrEqual(90);
  });

  it('cae con deuda vencida y metas en riesgo', () => {
    const malo = buildFinancePlan(
      plan({
        incomes: [income({ amount: 1500 })],
        fixedPayments: [payment({ accumulatedDebt: 1200, missedMonths: 4 })],
      }),
    );
    expect(malo.healthScore).toBeLessThan(40);
  });

  it('es 0 sin ingresos declarados', () => {
    expect(buildFinancePlan(plan({ incomes: [] })).healthScore).toBe(0);
  });
});

describe('simulatePlan', () => {
  it('convierte una meta en riesgo en alcanzable al sumar dinero extra', () => {
    const base = plan({ incomes: [income({ amount: 1700 })] });
    expect(buildFinancePlan(base).goals[0].feasibility).toBe('at_risk');

    // +500 alcanza, pero la meta se come el 91% del margen → "justa".
    const justo = simulatePlan(base, 500);
    expect(justo.cashFlow.extraMonthly).toBe(500);
    expect(justo.cashFlow.available).toBe(900);
    expect(justo.goals[0].feasibility).toBe('tight');
    expect(justo.goals[0].shortfallMonthly).toBe(0);

    // +900 deja holgura suficiente.
    expect(simulatePlan(base, 900).goals[0].feasibility).toBe('on_track');
  });

  it('no modifica la entrada original', () => {
    const base = plan();
    simulatePlan(base, 300);
    expect(base.extraMonthly).toBeUndefined();
  });
});
