import { describe, it, expect } from 'vitest';
import {
  addMonths,
  buildFinancePlan,
  daysUntil,
  monthlyEquivalent,
  monthsToReach,
  personalOnlyInput,
  simulatePlan,
  type CreditInput,
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

function credit(over: Partial<CreditInput> = {}): CreditInput {
  return {
    id: 'c1',
    name: 'Visa',
    balance: 1000,
    installment: 100,
    monthlyInterest: 30,
    monthsToPayoff: 12,
    neverPaysOff: false,
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

describe('buildFinancePlan — tarjetas y créditos', () => {
  it('resta las cuotas del dinero libre: no se reparte lo que ya tiene dueño', () => {
    const sin = buildFinancePlan(plan({ credits: [] }));
    const con = buildFinancePlan(plan({ credits: [credit({ installment: 250 })] }));
    expect(con.cashFlow.creditPayments).toBe(250);
    expect(con.cashFlow.available).toBe(sin.cashFlow.available - 250);
    expect(con.cashFlow.goalsBudget).toBeLessThan(sin.cashFlow.goalsBudget);
  });

  it('sin créditos el flujo no cambia (retrocompatible)', () => {
    const p = buildFinancePlan(plan());
    expect(p.cashFlow.creditPayments).toBe(0);
    expect(p.debts.creditBalance).toBe(0);
    expect(p.debts.creditOrder).toEqual([]);
  });

  it('suma saldo, interés mensual y compromiso de toda la cartera', () => {
    const { debts } = buildFinancePlan(
      plan({
        credits: [
          credit({ id: 'a', balance: 1000, monthlyInterest: 30, installment: 100 }),
          credit({ id: 'b', balance: 500, monthlyInterest: 40, installment: 60 }),
        ],
      }),
    );
    expect(debts.creditBalance).toBe(1500);
    expect(debts.creditMonthlyInterest).toBe(70);
    expect(debts.creditPayments).toBe(160);
  });

  it('ordena por lo que CUESTA al mes, no por saldo', () => {
    // La deuda chica al 8 % sangra más que la grande al 0.5 %.
    const { debts } = buildFinancePlan(
      plan({
        credits: [
          credit({ id: 'hipoteca', balance: 90_000, monthlyInterest: 45 }),
          credit({ id: 'tarjeta', balance: 1200, monthlyInterest: 96 }),
        ],
      }),
    );
    expect(debts.creditOrder.map((c) => c.id)).toEqual(['tarjeta', 'hipoteca']);
  });

  it('ignora los créditos ya liquidados', () => {
    const { debts } = buildFinancePlan(
      plan({ credits: [credit({ balance: 0, monthlyInterest: 0, installment: 0 })] }),
    );
    expect(debts.creditOrder).toEqual([]);
    expect(debts.creditBalance).toBe(0);
  });

  it('señala en crítico los créditos que no se liquidan nunca', () => {
    const { debts, advice } = buildFinancePlan(
      plan({ credits: [credit({ name: 'Tienda', neverPaysOff: true, monthsToPayoff: null })] }),
    );
    expect(debts.creditsStuck.map((c) => c.name)).toEqual(['Tienda']);
    const aviso = advice.find((a) => a.id === 'credits-stuck');
    expect(aviso?.tone).toBe('critical');
    expect(aviso?.action?.kind).toBe('open_debts');
  });

  it('nombra el interés en dinero al mes y al año, no en porcentaje', () => {
    const { advice } = buildFinancePlan(
      plan({ credits: [credit({ name: 'Visa', monthlyInterest: 60 })] }),
    );
    const aviso = advice.find((a) => a.id === 'credit-interest');
    expect(aviso?.title).toContain('$60');
    expect(aviso?.body).toContain('$720'); // 60 × 12 al año
    expect(aviso?.body).toContain('Visa');
  });

  it('sin créditos no emite consejos de crédito', () => {
    const { advice } = buildFinancePlan(plan({ credits: [] }));
    expect(advice.some((a) => a.id === 'credit-interest')).toBe(false);
    expect(advice.some((a) => a.id === 'credits-stuck')).toBe(false);
  });

  it('las cuotas pueden por sí solas poner el mes en negativo', () => {
    const { cashFlow, advice } = buildFinancePlan(
      plan({
        incomes: [income({ amount: 1500 })],
        credits: [credit({ installment: 400 })],
      }),
    );
    expect(cashFlow.available).toBe(1500 - 900 - 400 - 400);
    const deficit = advice.find((a) => a.id === 'negative-flow');
    expect(deficit?.body).toContain('créditos');
  });
});

describe('buildFinancePlan — personal vs negocio', () => {
  it('sin nada marcado, todo es personal y la sección ni existe', () => {
    const { scopes } = buildFinancePlan(plan());
    expect(scopes.hasBusiness).toBe(false);
    expect(scopes.business.expenses).toBe(0);
    expect(scopes.business.income).toBe(0);
  });

  it('reparte ingresos y gastos por su propio porcentaje', () => {
    const { scopes } = buildFinancePlan(
      plan({
        incomes: [
          income({ id: 'sueldo', amount: 2000, businessShare: 0 }),
          income({ id: 'factura', amount: 3000, businessShare: 100 }),
        ],
        fixedPayments: [
          payment({ id: 'renta', amount: 900, businessShare: 0 }),
          payment({ id: 'local', amount: 600, businessShare: 100 }),
          payment({ id: 'movil', amount: 100, businessShare: 60 }),
        ],
      }),
    );
    expect(scopes.hasBusiness).toBe(true);
    expect(scopes.personal.income).toBe(2000);
    expect(scopes.business.income).toBe(3000);
    expect(scopes.personal.fixedPayments).toBe(940); // 900 + 40
    expect(scopes.business.fixedPayments).toBe(660); // 600 + 60
  });

  it('sin compras marcadas, el super va entero a personal', () => {
    const { scopes, cashFlow } = buildFinancePlan(
      plan({ fixedPayments: [payment({ amount: 900, businessShare: 100 })] }),
    );
    expect(scopes.personal.groceries).toBe(cashFlow.groceriesEstimate);
    expect(scopes.business.groceries).toBe(0);
  });

  it('reparte el super con el porcentaje ponderado de las compras', () => {
    const { scopes } = buildFinancePlan(
      plan({ groceriesMonthly: 400, groceriesBusinessShare: 25 }),
    );
    expect(scopes.business.groceries).toBe(100);
    expect(scopes.personal.groceries).toBe(300);
  });

  it('un super marcado como del negocio basta para activar la sección', () => {
    const { scopes } = buildFinancePlan(
      plan({ groceriesMonthly: 200, groceriesBusinessShare: 100 }),
    );
    expect(scopes.hasBusiness).toBe(true);
    expect(scopes.businessResult.expenses).toBe(200);
  });

  it('al excluir el negocio, el super del negocio deja de restar', () => {
    const entrada = plan({ groceriesMonthly: 400, groceriesBusinessShare: 25 });
    const con = buildFinancePlan(entrada);
    const sin = buildFinancePlan(personalOnlyInput(entrada));
    expect(sin.cashFlow.groceriesEstimate).toBe(300);
    expect(sin.cashFlow.available).toBe(con.cashFlow.available + 100);
  });

  it('reparte también las cuotas de crédito', () => {
    const { scopes } = buildFinancePlan(
      plan({ credits: [credit({ installment: 200, businessShare: 75 })] }),
    );
    expect(scopes.business.creditPayments).toBe(150);
    expect(scopes.personal.creditPayments).toBe(50);
  });

  it('los dos lados suman siempre el total del mes', () => {
    const p = buildFinancePlan(
      plan({
        incomes: [income({ amount: 3000, businessShare: 40 })],
        fixedPayments: [payment({ amount: 900, businessShare: 33.33 })],
        credits: [credit({ installment: 137.77, businessShare: 61.5 })],
      }),
    );
    const { scopes, cashFlow } = p;
    expect(scopes.personal.income + scopes.business.income).toBeCloseTo(cashFlow.monthlyIncome, 2);
    expect(scopes.personal.fixedPayments + scopes.business.fixedPayments).toBeCloseTo(cashFlow.fixedPayments, 2);
    expect(scopes.personal.creditPayments + scopes.business.creditPayments).toBeCloseTo(cashFlow.creditPayments, 2);
  });

  it('NO altera el dinero libre: el reparto es aditivo', () => {
    const sinMarcar = buildFinancePlan(plan());
    const marcado = buildFinancePlan(
      plan({ fixedPayments: [payment({ amount: 900, businessShare: 100 })] }),
    );
    expect(marcado.cashFlow.available).toBe(sinMarcar.cashFlow.available);
  });

  it('calcula el resultado del negocio con su margen', () => {
    const { scopes } = buildFinancePlan(
      plan({
        incomes: [income({ amount: 4000, businessShare: 100 })],
        fixedPayments: [payment({ amount: 1000, businessShare: 100 })],
        credits: [],
      }),
    );
    expect(scopes.businessResult.income).toBe(4000);
    expect(scopes.businessResult.expenses).toBe(1000);
    expect(scopes.businessResult.result).toBe(3000);
    expect(scopes.businessResult.margin).toBe(75);
  });

  it('avisa cuando el negocio gasta sin ingresos declarados', () => {
    const { scopes, advice } = buildFinancePlan(
      plan({ fixedPayments: [payment({ amount: 600, businessShare: 100 })] }),
    );
    expect(scopes.businessResult.expensesWithoutIncome).toBe(true);
    expect(advice.find((a) => a.id === 'business-no-income')?.tone).toBe('warning');
  });

  it('avisa en crítico cuando el negocio pierde dinero', () => {
    const { advice } = buildFinancePlan(
      plan({
        incomes: [income({ amount: 1000, businessShare: 100 })],
        fixedPayments: [payment({ amount: 1500, businessShare: 100 })],
      }),
    );
    const aviso = advice.find((a) => a.id === 'business-loss');
    expect(aviso?.tone).toBe('critical');
    expect(aviso?.title).toContain('500');
  });

  it('celebra el negocio que deja dinero', () => {
    const { advice } = buildFinancePlan(
      plan({
        incomes: [income({ amount: 5000, businessShare: 100 })],
        fixedPayments: [payment({ amount: 2000, businessShare: 100 })],
      }),
    );
    expect(advice.find((a) => a.id === 'business-result')?.tone).toBe('good');
  });

  it('sin negocio no emite ningún consejo de negocio', () => {
    const { advice } = buildFinancePlan(plan());
    expect(advice.some((a) => a.id.startsWith('business-'))).toBe(false);
  });

  it('un ingreso inactivo no cuenta en ninguno de los dos lados', () => {
    const { scopes } = buildFinancePlan(
      plan({ incomes: [income({ amount: 3000, businessShare: 100, isActive: false })] }),
    );
    expect(scopes.business.income).toBe(0);
    expect(scopes.personal.income).toBe(0);
  });
});

describe('personalOnlyInput', () => {
  it('deja solo la parte personal de ingresos, pagos y cuotas', () => {
    const entrada = plan({
      incomes: [income({ amount: 3000, businessShare: 60 })],
      fixedPayments: [payment({ amount: 1000, businessShare: 40 })],
      credits: [credit({ installment: 200, businessShare: 25 })],
    });
    const solo = personalOnlyInput(entrada);
    expect(solo.incomes[0].amount).toBe(1200);
    expect(solo.fixedPayments[0].amount).toBe(600);
    expect(solo.credits![0].installment).toBe(150);
  });

  /**
   * Una deuda del negocio no puede aparecer a medias en el plan personal.
   *
   * Antes solo se repartía la cuota, así que el coche del negocio aportaba $0 al
   * mes —correcto— pero su saldo entero seguía sumando en «lo que debes». La
   * pantalla decía a la vez que la deuda no es tuya y que la debes.
   */
  it('reparte también el saldo y el interés de las cuotas', () => {
    const solo = personalOnlyInput(
      plan({
        credits: [credit({ balance: 1000, installment: 200, monthlyInterest: 40, businessShare: 25 })],
      }),
    );
    expect(solo.credits![0].balance).toBe(750);
    expect(solo.credits![0].installment).toBe(150);
    expect(solo.credits![0].monthlyInterest).toBe(30);
  });

  it('una deuda 100 % del negocio DESAPARECE del plan personal', () => {
    // Lo que se pidió: lo del negocio es del negocio. Con saldo 0 la deuda ya no
    // entra en `creditOrder`, así que no suma ni sale listada.
    const soloNegocio = plan({
      credits: [credit({ id: 'auto', balance: 35460, installment: 1097, monthlyInterest: 210, businessShare: 100 })],
    });

    const conNegocio = buildFinancePlan(soloNegocio).debts;
    expect(conNegocio.creditPayments).toBe(1097);
    expect(conNegocio.creditOrder).toHaveLength(1);

    const sinNegocio = buildFinancePlan(personalOnlyInput(soloNegocio)).debts;
    expect(sinNegocio.creditPayments).toBe(0);
    expect(sinNegocio.creditBalance).toBe(0);
    expect(sinNegocio.creditOrder).toHaveLength(0);
  });

  it('una deuda mixta se queda con su parte, no entera', () => {
    const mixta = plan({
      credits: [credit({ balance: 2000, installment: 400, monthlyInterest: 60, businessShare: 50 })],
    });
    const personal = buildFinancePlan(personalOnlyInput(mixta)).debts;
    expect(personal.creditBalance).toBe(1000);
    expect(personal.creditPayments).toBe(200);
    expect(personal.creditOrder).toHaveLength(1);
  });

  it('deja el ámbito en 0: ya no queda nada de negocio que repartir', () => {
    const solo = personalOnlyInput(
      plan({ fixedPayments: [payment({ amount: 500, businessShare: 100 })] }),
    );
    expect(solo.fixedPayments[0].businessShare).toBe(0);
    expect(buildFinancePlan(solo).scopes.hasBusiness).toBe(false);
  });

  it('no toca el super, que nunca tuvo ámbito', () => {
    const entrada = plan();
    expect(personalOnlyInput(entrada).groceriesMonthly).toBe(entrada.groceriesMonthly);
  });

  it('sin negocio marcado, el plan sale idéntico', () => {
    const entrada = plan();
    const a = buildFinancePlan(entrada);
    const b = buildFinancePlan(personalOnlyInput(entrada));
    expect(b.cashFlow.available).toBe(a.cashFlow.available);
    expect(b.cashFlow.goalsBudget).toBe(a.cashFlow.goalsBudget);
  });

  it('excluir el negocio cambia lo que hay para metas', () => {
    const entrada = plan({
      incomes: [income({ amount: 3000, businessShare: 0 })],
      fixedPayments: [payment({ amount: 1200, businessShare: 100 })],
    });
    const con = buildFinancePlan(entrada);
    const sin = buildFinancePlan(personalOnlyInput(entrada));
    // Sin el gasto del negocio queda MÁS dinero personal para la meta.
    expect(sin.cashFlow.available).toBe(con.cashFlow.available + 1200);
  });

  it('quitar un ingreso del negocio deja MENOS para la meta', () => {
    const entrada = plan({
      incomes: [
        income({ id: 'sueldo', amount: 2000, businessShare: 0 }),
        income({ id: 'factura', amount: 4000, businessShare: 100 }),
      ],
    });
    const con = buildFinancePlan(entrada);
    const sin = buildFinancePlan(personalOnlyInput(entrada));
    expect(sin.cashFlow.monthlyIncome).toBe(2000);
    expect(sin.cashFlow.available).toBe(con.cashFlow.available - 4000);
  });

  it('respeta la frecuencia del ingreso al repartir', () => {
    const solo = personalOnlyInput(
      plan({ incomes: [income({ amount: 1000, frequency: 'biweekly', businessShare: 50 })] }),
    );
    expect(solo.incomes[0].amount).toBe(500);
    expect(solo.incomes[0].frequency).toBe('biweekly');
  });
});

describe('buildFinancePlan — consejos', () => {
  it('no repite el "registra tus ingresos" que ya pide la cabecera', () => {
    const { advice } = buildFinancePlan(plan({ incomes: [] }));
    expect(advice.some((a) => a.id === 'no-income')).toBe(false);
    expect(advice.some((a) => a.action?.kind === 'add_income')).toBe(false);
  });

  it('sin ingresos tampoco emite los consejos de flujo, que saldrían de dividir entre cero', () => {
    const { advice } = buildFinancePlan(plan({ incomes: [] }));
    expect(advice.some((a) => a.id === 'negative-flow')).toBe(false);
    expect(advice.some((a) => a.id === 'low-savings-rate')).toBe(false);
    expect(advice.some((a) => a.id === 'healthy-savings-rate')).toBe(false);
  });

  it('no repite el "crea tu primera meta" que ya muestra la sección vacía', () => {
    const { advice } = buildFinancePlan(plan({ goals: [] }));
    expect(advice.some((a) => a.id === 'no-goals')).toBe(false);
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

  it('calla sobre el ritmo los primeros días del mes', () => {
    // Caso real del 1 de agosto: sin compras aún, la proyección es $0 y salía
    // un absurdo "estás gastando 100% menos en super".
    const { advice } = conCompras({
      daysElapsed: 1, spentThisMonth: 0, projectedMonthEnd: 0,
      trendPct: -100, overLimit: -400, avgMonthly: 220, monthsWithData: 3,
    });
    const superAdvice = advice.filter((a) => a.id.startsWith('grocery-'));
    expect(superAdvice.map((a) => a.id)).not.toContain('grocery-trend-down');
    expect(superAdvice.map((a) => a.id)).not.toContain('grocery-under-limit');
    expect(superAdvice.map((a) => a.id)).not.toContain('grocery-pace-over-limit');
  });

  it('vuelve a opinar del ritmo pasada la primera semana', () => {
    const { advice } = conCompras({ daysElapsed: 10, projectedMonthEnd: 800, overLimit: 400, trendPct: 45, avgMonthly: 550, monthsWithData: 3 });
    expect(advice.some((a) => a.id === 'grocery-pace-over-limit')).toBe(true);
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

describe('otherExpensesMonthly — el gasto que no es super', () => {
  it('se resta del dinero libre', () => {
    // Sin esto el plan repartía entre metas un dinero ya gastado en comer
    // fuera, y la meta fallaba a fin de mes sin que nada lo explicara.
    const sin = buildFinancePlan(plan());
    const con = buildFinancePlan(plan({ otherExpensesMonthly: 250 }));
    expect(con.cashFlow.otherExpenses).toBe(250);
    expect(con.cashFlow.available).toBe(sin.cashFlow.available - 250);
  });

  it('es cero cuando no se le pasa nada — el plan de siempre', () => {
    const p = buildFinancePlan(plan());
    expect(p.cashFlow.otherExpenses).toBe(0);
    expect(p.cashFlow.available).toBe(3000 - 900 - 400);
  });

  it('ignora importes negativos', () => {
    const p = buildFinancePlan(plan({ otherExpensesMonthly: -80 }));
    expect(p.cashFlow.otherExpenses).toBe(0);
  });

  it('reduce lo que se puede asignar a las metas', () => {
    const sin = buildFinancePlan(plan({ goals: [goal({ targetAmount: 9000 })] }));
    const con = buildFinancePlan(plan({ goals: [goal({ targetAmount: 9000 })], otherExpensesMonthly: 500 }));
    expect(con.goals[0].allocatedMonthly).toBeLessThan(sin.goals[0].allocatedMonthly);
  });

  it('puede volver negativo el mes y disparar el aviso', () => {
    const p = buildFinancePlan(plan({ incomes: [income({ amount: 1400 })], otherExpensesMonthly: 400 }));
    expect(p.cashFlow.available).toBeLessThan(0);
    const alerta = p.advice.find((a) => a.id === 'negative-flow');
    expect(alerta).toBeDefined();
    expect(alerta?.body).toContain('fuera del super');
  });

  it('se reparte entre personal y negocio con su propio porcentaje', () => {
    const p = buildFinancePlan(plan({ otherExpensesMonthly: 200, otherBusinessShare: 75 }));
    expect(p.scopes.business.otherExpenses).toBe(150);
    expect(p.scopes.personal.otherExpenses).toBe(50);
    expect(p.scopes.hasBusiness).toBe(true);
    // Y entra en el total de gastos de cada lado, no solo en su propia fila.
    expect(p.scopes.business.expenses).toBe(150);
  });

  it('la vista solo-personal se queda con su parte', () => {
    const personal = personalOnlyInput(plan({ otherExpensesMonthly: 200, otherBusinessShare: 75 }));
    expect(personal.otherExpensesMonthly).toBe(50);
    expect(personal.otherBusinessShare).toBe(0);
  });

  it('sin negocio marcado no inventa uno', () => {
    const p = buildFinancePlan(plan({ otherExpensesMonthly: 200 }));
    expect(p.scopes.personal.otherExpenses).toBe(200);
    expect(p.scopes.business.otherExpenses).toBe(0);
    expect(p.scopes.hasBusiness).toBe(false);
  });
});

describe('consejos sobre el gasto que no es super', () => {
  function otherSpend(over: Partial<import('./other-spend').OtherSpendInsight> = {}) {
    return {
      spentThisMonth: 300,
      countThisMonth: 6,
      avgMonthly: 200,
      lastMonth: 210,
      monthsWithData: 3,
      projectedMonthEnd: 300,
      baseline: 300,
      baselineSource: 'pace' as const,
      byKind: [
        { kind: 'dining' as const, currentMonth: 220, prevMonth: 120, count: 5, deltaPct: 83, share: 73 },
        { kind: 'fuel' as const, currentMonth: 80, prevMonth: 90, count: 1, deltaPct: -11, share: 27 },
      ],
      biggestMover: { kind: 'dining' as const, currentMonth: 220, prevMonth: 120, count: 5, deltaPct: 83, share: 73 },
      topPlaces: [{ name: 'Pollo Tropical', total: 120, count: 3 }],
      trendPct: 50,
      hasData: true,
      ...over,
    };
  }

  it('nombra el tipo de gasto que se lleva el mes', () => {
    const p = buildFinancePlan(plan({ otherExpensesMonthly: 300, otherSpend: otherSpend() }));
    const a = p.advice.find((x) => x.id === 'other-top-dining');
    expect(a).toBeDefined();
    expect(a?.title).toContain('Comida fuera');
  });

  it('avisa cuando la tendencia sube de verdad', () => {
    const p = buildFinancePlan(plan({ otherExpensesMonthly: 300, otherSpend: otherSpend() }));
    const a = p.advice.find((x) => x.id === 'other-trend-up');
    expect(a?.tone).toBe('warning');
    expect(a?.body).toContain('Comida fuera');
  });

  it('felicita cuando baja', () => {
    const p = buildFinancePlan(plan({
      otherExpensesMonthly: 100,
      otherSpend: otherSpend({ trendPct: -40, projectedMonthEnd: 120, avgMonthly: 200, biggestMover: null }),
    }));
    expect(p.advice.find((x) => x.id === 'other-trend-down')?.tone).toBe('good');
  });

  it('calla con un solo mes de historial: comparar contra ruido no es un consejo', () => {
    const p = buildFinancePlan(plan({
      otherExpensesMonthly: 300,
      otherSpend: otherSpend({ monthsWithData: 1 }),
    }));
    expect(p.advice.find((x) => x.id === 'other-trend-up')).toBeUndefined();
  });

  it('calla del todo si no hay gastos de este tipo', () => {
    const p = buildFinancePlan(plan({ otherSpend: otherSpend({ hasData: false }) }));
    expect(p.advice.some((x) => x.id.startsWith('other-'))).toBe(false);
  });

  it('no señala un reparto normal como si fuera un problema', () => {
    const p = buildFinancePlan(plan({
      otherExpensesMonthly: 300,
      otherSpend: otherSpend({
        trendPct: 0,
        byKind: [
          { kind: 'dining', currentMonth: 90, prevMonth: 90, count: 2, deltaPct: 0, share: 30 },
          { kind: 'fuel', currentMonth: 90, prevMonth: 90, count: 2, deltaPct: 0, share: 30 },
        ],
      }),
    }));
    expect(p.advice.some((x) => x.id.startsWith('other-top-'))).toBe(false);
  });
});

describe('meta en riesgo — la explicación distingue la CAUSA', () => {
  // El mensaje viejo decía siempre lo mismo: "el plan solo puede darle $0. Te
  // faltan $X. Opciones: bajar la meta a $0". Tres veces la misma cifra, un $0
  // sin origen, y una opción que no significa nada. Ahora cada causa tiene su
  // explicación y sus opciones.
  const meta = goal({ targetAmount: 3000, savedAmount: 0, targetDate: '2026-10-15' });

  it('sin ingresos: una sola tarjeta para TODAS las metas, no una por meta', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [],
      goals: [meta, goal({ id: 'g2', name: 'Coche', targetAmount: 5000 })],
    }));
    expect(advice.filter((a) => a.id.startsWith('goal-risk-'))).toHaveLength(0);
    const uno = advice.filter((a) => a.id === 'goals-need-income');
    expect(uno).toHaveLength(1);
    expect(uno[0].title).toContain('2 metas');
    expect(uno[0].body).toContain('no sabe cuánto ganas');
  });

  it('sin ingresos NO vuelve a pedir el dato que ya pide la cabecera', () => {
    const { advice } = buildFinancePlan(plan({ incomes: [], goals: [meta] }));
    const aviso = advice.find((a) => a.id === 'goals-need-income');
    expect(aviso?.action).toBeUndefined();
    expect(aviso?.steps?.[0]).toContain('Ingresos');
  });

  it('con una sola meta habla en singular', () => {
    const { advice } = buildFinancePlan(plan({ incomes: [], goals: [meta] }));
    expect(advice.find((a) => a.id === 'goals-need-income')?.title).toBe(
      'Viaje a Argentina está en pausa',
    );
  });

  it('mes en rojo: lo dice UNA vez, nombra las metas paradas y de dónde sale el hueco', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 1000 })],
      fixedPayments: [payment({ amount: 900 })],
      goals: [meta],
    }));
    const a = advice.find((x) => x.id === 'goals-no-room');
    expect(a?.title).toBe('Tu meta no avanza este mes');
    // Abre con el dato, no con dos negaciones: la version anterior empezaba
    // «No es un problema de esta meta, es del mes», que hay que releer.
    expect(a?.body).toContain('se te va más de lo que entra');
    expect(a?.body).toContain('$1,000');
    // Nombra cuál está parada: es lo que se perdería al fundir las tarjetas.
    expect(a?.body).toContain(meta.name);
    expect(a?.topic).toBe('goals');
    expect(a?.action?.kind).toBe('open_payments');
    expect(a?.steps?.some((s) => s.includes('pagos fijos'))).toBe(true);
  });

  it('con VARIAS metas paradas sigue habiendo UNA sola tarjeta', () => {
    // Antes salía una por meta, con el mismo párrafo y los mismos pasos: tres
    // metas eran tres bloques idénticos que tapaban el resto del consejero.
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 1000 })],
      fixedPayments: [payment({ amount: 900 })],
      goals: [
        goal({ id: 'g1', name: 'Viaje' }),
        goal({ id: 'g2', name: 'Laptop' }),
        goal({ id: 'g3', name: 'Fondo' }),
      ],
    }));

    expect(advice.filter((a) => a.id === 'goals-no-room')).toHaveLength(1);
    expect(advice.filter((a) => a.id.startsWith('goal-risk-'))).toHaveLength(0);

    const a = advice.find((x) => x.id === 'goals-no-room');
    expect(a?.title).toBe('Tus metas no avanzan este mes');
    // Las tres, enumeradas como se enumera al hablar.
    expect(a?.body).toContain('Viaje, Laptop y Fondo');
  });

  it('otras metas se llevan el dinero: lo dice y ofrece prioridad', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 3000 })],
      fixedPayments: [payment({ amount: 900 })],
      // La primera se lo come todo; la segunda se queda a cero.
      goals: [
        goal({ id: 'g1', name: 'Urgente', priority: 1, targetAmount: 90000, targetDate: '2026-09-01' }),
        goal({ id: 'g2', name: 'Segunda', priority: 3, targetAmount: 3000, targetDate: '2026-12-01' }),
      ],
    }));
    const a = advice.find((x) => x.id === 'goal-risk-g2');
    expect(a?.title).toContain('no recibe nada');
    expect(a?.body).toContain('se los reparten enteros');
    expect(a?.steps?.some((s) => s.includes('prioridad'))).toBe(true);
  });

  it('recibe algo pero no alcanza: da la cifra real y opciones que sirven', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 3000 })],
      fixedPayments: [payment({ amount: 900 })],
      goals: [goal({ targetAmount: 40000, savedAmount: 5000, targetDate: '2026-10-15' })],
    }));
    const a = advice.find((x) => x.id.startsWith('goal-risk-'));
    expect(a?.title).toContain('no llega a tiempo');
    expect(a?.body).toContain('Se queda corta por');
    expect(a?.steps && a.steps.length).toBeGreaterThan(0);
  });

  it('nunca ofrece "baja el objetivo a $0"', () => {
    // Era la opción sin sentido del mensaje viejo: con $0 asignados, el
    // objetivo alcanzable calculado daba exactamente cero.
    for (const p of [
      plan({ incomes: [income({ amount: 1000 })], fixedPayments: [payment({ amount: 900 })], goals: [meta] }),
      plan({ incomes: [income({ amount: 3000 })], goals: [goal({ targetAmount: 99999, targetDate: '2026-09-01' })] }),
    ]) {
      for (const a of buildFinancePlan(p).advice) {
        for (const step of a.steps ?? []) {
          expect(step).not.toContain('objetivo a $0');
        }
      }
    }
  });

  it('las opciones van en lista, no apelmazadas con punto y coma', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 3000 })],
      fixedPayments: [payment({ amount: 900 })],
      goals: [goal({ targetAmount: 40000, savedAmount: 5000, targetDate: '2026-10-15' })],
    }));
    const a = advice.find((x) => x.id.startsWith('goal-risk-'));
    expect(a?.body).not.toContain('Opciones:');
    expect(a?.body).not.toContain(';');
  });
});

describe('meta vencida — no promete fechas sin ritmo', () => {
  it('con ritmo asignado da la fecha nueva', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 3000 })],
      goals: [goal({ targetAmount: 2000, savedAmount: 500, targetDate: '2026-07-01' })],
    }));
    const a = advice.find((x) => x.id.startsWith('goal-overdue-'));
    expect(a?.body).toContain('los tendrías hacia el');
  });

  it('sin ritmo NO dice "al ritmo de $0 la lograrías"', () => {
    const { advice } = buildFinancePlan(plan({
      incomes: [income({ amount: 1000 })],
      fixedPayments: [payment({ amount: 1500 })],
      goals: [goal({ targetAmount: 2000, savedAmount: 500, targetDate: '2026-07-01' })],
    }));
    const a = advice.find((x) => x.id.startsWith('goal-overdue-'));
    expect(a?.body).toContain('no puede apartarle nada');
    expect(a?.body).not.toContain('al ritmo de $0');
  });
});

describe('cuota enlazada a un pago mensual — no se cuenta dos veces', () => {
  // El bug real: la cuota del coche estaba en Pagos como «GMC» ($1,097, 100 %
  // negocio) Y en Deudas como «Auto» (cuota $1,097, 100 % negocio). El plan
  // restaba las dos, así que el negocio parecía gastar $3,411 en vez de $2,314.
  const gmc = payment({ id: 'p-gmc', name: 'GMC', amount: 1097, businessShare: 100 });
  const auto = credit({ id: 'd-auto', name: 'Auto', installment: 1097, businessShare: 100 });

  it('sin enlazar, resta las dos (el comportamiento roto que se documenta)', () => {
    const p = buildFinancePlan(plan({ fixedPayments: [gmc], credits: [auto], goals: [] }));
    expect(p.cashFlow.fixedPayments).toBe(1097);
    expect(p.cashFlow.creditPayments).toBe(1097);
  });

  it('enlazada, la cuota deja de restarse', () => {
    const p = buildFinancePlan(plan({
      fixedPayments: [gmc],
      credits: [{ ...auto, linkedPaymentId: 'p-gmc' }],
      goals: [],
    }));
    expect(p.cashFlow.fixedPayments).toBe(1097);
    expect(p.cashFlow.creditPayments).toBe(0);
  });

  it('el dinero libre sube exactamente lo que se dejó de contar dos veces', () => {
    const base = plan({ fixedPayments: [gmc], credits: [auto], goals: [] });
    const roto = buildFinancePlan(base);
    const bueno = buildFinancePlan({ ...base, credits: [{ ...auto, linkedPaymentId: 'p-gmc' }] });
    expect(bueno.cashFlow.available - roto.cashFlow.available).toBe(1097);
  });

  it('el negocio deja de gastar el doble', () => {
    const p = buildFinancePlan(plan({
      fixedPayments: [gmc, payment({ id: 'p2', name: 'Cable', amount: 917, businessShare: 100 })],
      credits: [{ ...auto, linkedPaymentId: 'p-gmc' }],
      goals: [],
    }));
    // 1097 + 917 de pagos fijos, y la cuota ya NO se suma encima.
    expect(p.scopes.business.fixedPayments).toBe(2014);
    expect(p.scopes.business.creditPayments).toBe(0);
    expect(p.scopes.business.expenses).toBe(2014);
  });

  it('la fila del crédito se marca como ya contada, para que el total cuadre', () => {
    const p = buildFinancePlan(plan({
      fixedPayments: [gmc],
      credits: [{ ...auto, linkedPaymentId: 'p-gmc' }, credit({ id: 'c2', installment: 110 })],
      goals: [],
    }));
    const fila = p.debts.creditOrder.find((c) => c.id === 'd-auto');
    expect(fila?.countedInPayments).toBe(true);
    // La cuota real se sigue mostrando: es verdad que la cuota son $1,097.
    expect(fila?.installment).toBe(1097);
    // Pero el comprometido solo cuenta la que no está en Pagos.
    expect(p.debts.creditPayments).toBe(110);
  });

  it('un enlace huérfano vuelve a contar: el dinero no puede desaparecer', () => {
    // Si el usuario borró el recibo de Pagos, ese dinero vuelve a salir por la
    // cuota. Seguir excluyéndola lo haría desaparecer del plan — el error
    // contrario, y mucho más difícil de notar.
    const p = buildFinancePlan(plan({
      fixedPayments: [],
      credits: [{ ...auto, linkedPaymentId: 'p-gmc' }],
      goals: [],
    }));
    expect(p.cashFlow.creditPayments).toBe(1097);
    expect(p.debts.creditOrder[0].countedInPayments).toBe(false);
  });

  it('la vista solo-personal respeta el enlace', () => {
    const p = buildFinancePlan(personalOnlyInput(plan({
      fixedPayments: [gmc],
      credits: [{ ...auto, linkedPaymentId: 'p-gmc' }],
      goals: [],
    })));
    // El pago es 100 % negocio, así que en personal no queda ni el pago ni la
    // cuota — y desde luego no la cuota sola.
    expect(p.cashFlow.fixedPayments).toBe(0);
    expect(p.cashFlow.creditPayments).toBe(0);
  });

  it('el interés del crédito enlazado se sigue contando: eso no lo cubre el recibo', () => {
    const p = buildFinancePlan(plan({
      fixedPayments: [gmc],
      credits: [{ ...auto, linkedPaymentId: 'p-gmc', monthlyInterest: 211 }],
      goals: [],
    }));
    expect(p.debts.creditMonthlyInterest).toBe(211);
    expect(p.debts.creditBalance).toBe(1000);
  });
});

/**
 * Con «contar el negocio» apagado, el consejero tiene que hablar el MISMO
 * idioma que la cascada del mes.
 *
 * Aquí estaba la mezcla: el plan restaba el super ya repartido por su
 * porcentaje de negocio, pero los consejos leen los objetos de detalle —el
 * ritmo, las categorías, los tipos de gasto— y esos pasaban sin repartir. La
 * misma pantalla daba dos versiones del mismo gasto.
 */
describe('personalOnlyInput — los panoramas también se reparten', () => {
  const detalle: GroceryInsight = {
    ...EMPTY_GROCERY_INSIGHT,
    spentThisMonth: 400,
    tripsThisMonth: 8,
    daysElapsed: 20,
    daysInMonth: 30,
    dailyPace: 20,
    projectedMonthEnd: 600,
    avgMonthly: 500,
    lastMonth: 450,
    monthsWithData: 3,
    limit: 500,
    baseline: 600,
    baselineSource: 'pace',
    overLimit: 100,
    trendPct: 20,
    categories: [{ category: 'carnes', currentMonth: 200, prevMonth: 100, deltaPct: 100, share: 50 }],
    biggestMover: { category: 'carnes', currentMonth: 200, prevMonth: 100, deltaPct: 100, share: 50 },
  };

  it('reparte el dinero del panorama de super', () => {
    const solo = personalOnlyInput(
      plan({ groceries: detalle, groceriesMonthly: 600, groceriesBusinessShare: 25 }),
    );
    // Un cuarto es del negocio: se queda el 75 % de cada cifra de dinero.
    expect(solo.groceries!.spentThisMonth).toBe(300);
    expect(solo.groceries!.projectedMonthEnd).toBe(450);
    expect(solo.groceries!.avgMonthly).toBe(375);
    expect(solo.groceries!.baseline).toBe(450);
    expect(solo.groceries!.categories[0].currentMonth).toBe(150);
    expect(solo.groceries!.biggestMover!.currentMonth).toBe(150);
  });

  it('el panorama repartido cuadra con lo que resta la cascada', () => {
    // Los dos caminos tienen que dar la misma cifra: es justo lo que fallaba.
    const solo = personalOnlyInput(
      plan({ groceries: detalle, groceriesMonthly: detalle.baseline, groceriesBusinessShare: 25 }),
    );
    expect(solo.groceries!.baseline).toBe(solo.groceriesMonthly);
  });

  it('no toca los conteos ni los porcentajes', () => {
    const solo = personalOnlyInput(
      plan({ groceries: detalle, groceriesMonthly: 600, groceriesBusinessShare: 25 }),
    );
    // Los tickets son los mismos tickets, y como el reparto es uniforme las
    // proporciones y la tendencia no cambian.
    expect(solo.groceries!.tripsThisMonth).toBe(8);
    expect(solo.groceries!.daysElapsed).toBe(20);
    expect(solo.groceries!.trendPct).toBe(20);
    expect(solo.groceries!.categories[0].share).toBe(50);
  });

  it('respeta el límite escrito por el usuario y recalcula cuánto se pasa', () => {
    // El límite no es un importe repartible: es una cifra que él puso.
    const solo = personalOnlyInput(
      plan({ groceries: detalle, groceriesMonthly: 600, groceriesBusinessShare: 25 }),
    );
    expect(solo.groceries!.limit).toBe(500);
    // Proyección personal (450) contra su límite (500): ya no se pasa.
    expect(solo.groceries!.overLimit).toBe(-50);
  });

  it('sin negocio devuelve el panorama intacto', () => {
    const solo = personalOnlyInput(
      plan({ groceries: detalle, groceriesMonthly: 600, groceriesBusinessShare: 0 }),
    );
    expect(solo.groceries).toBe(detalle);
  });
})

/**
 * El caso que reporto el usuario: «quizas hoy cobro un cheque de xxx y quizas
 * mañana otro, y asi sucesivamente».
 *
 * `one_time` existia en el tipo, en la validacion y hasta con etiqueta escrita,
 * pero valia 0 en toda la aritmetica y ni siquiera se ofrecia en la pantalla.
 * Quien cobra por trabajos no tenia forma de que la app viera un solo dolar: la
 * unica pregunta era «¿cuanto ganas al mes?» y la respuesta honesta es
 * «depende».
 */
describe('buildFinancePlan — cheques y pagos sueltos', () => {
  const cheque = (over: Partial<IncomeSource> = {}): IncomeSource =>
    income({ id: 'c1', name: 'Cheque', frequency: 'one_time', amount: 1200, receivedOn: '2026-07-15', ...over });

  it('un cheque cobrado este mes cuenta ENTERO', () => {
    const { cashFlow } = buildFinancePlan(plan({ incomes: [cheque()] }));
    expect(cashFlow.oneTimeIncome).toBe(1200);
    expect(cashFlow.monthlyIncome).toBe(1200);
  });

  it('el de otro mes no cuenta, ni el de antes ni el de despues', () => {
    for (const dia of ['2026-06-30', '2026-08-01']) {
      const { cashFlow } = buildFinancePlan(plan({ incomes: [cheque({ receivedOn: dia })] }));
      expect(cashFlow.oneTimeIncome).toBe(0);
      expect(cashFlow.monthlyIncome).toBe(0);
    }
  });

  it('varios cheques del mismo mes se suman', () => {
    const { cashFlow } = buildFinancePlan(
      plan({
        incomes: [
          cheque({ id: 'c1', amount: 1200, receivedOn: '2026-07-15' }),
          cheque({ id: 'c2', amount: 850.4, receivedOn: '2026-07-22' }),
          cheque({ id: 'c3', amount: 300, receivedOn: '2026-07-31' }),
        ],
      }),
    );
    expect(cashFlow.oneTimeIncome).toBe(2350.4);
  });

  it('no se confunde con el sueldo: se cuentan aparte y se suman para el mes', () => {
    // La cifra total tiene que ser exacta, pero llamar «ingreso mensual» a un
    // cheque seria mentir sobre el mes que viene.
    const { cashFlow } = buildFinancePlan(plan({ incomes: [income(), cheque()] }));
    expect(cashFlow.recurringIncome).toBe(3000);
    expect(cashFlow.oneTimeIncome).toBe(1200);
    expect(cashFlow.monthlyIncome).toBe(4200);
  });

  it('el cheque mueve lo que queda libre, que es de lo que come el plan', () => {
    const sinCheque = buildFinancePlan(plan()).cashFlow.available;
    const conCheque = buildFinancePlan(plan({ incomes: [income(), cheque()] })).cashFlow.available;
    expect(conCheque - sinCheque).toBe(1200);
  });

  it('un cheque desactivado deja de contar sin borrarlo', () => {
    const { cashFlow } = buildFinancePlan(plan({ incomes: [cheque({ isActive: false })] }));
    expect(cashFlow.oneTimeIncome).toBe(0);
  });

  it('sin fecha no se inventa el mes: no cuenta', () => {
    const { cashFlow } = buildFinancePlan(plan({ incomes: [cheque({ receivedOn: null })] }));
    expect(cashFlow.oneTimeIncome).toBe(0);
  });

  it('un cheque del negocio llega al reparto personal/negocio', () => {
    // Antes se repartia la tasa mensual, que en un suelto es 0: el negocio
    // cobraba y seguia pareciendo que solo gasta.
    const { scopes } = buildFinancePlan(plan({ incomes: [cheque({ businessShare: 100 })] }));
    expect(scopes.business.income).toBe(1200);
    expect(scopes.personal.income).toBe(0);
  });
});
