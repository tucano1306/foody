import { describe, expect, it } from 'vitest';
import { buildFinancePlan, goalWithDebt, type FinanceGoal, type GoalDebtLink, type PlanInput } from './finance-engine';

/**
 * «Si yo hago abonos en la sección de Deudas, ese abono y cualquier otra
 * transacción que haga en las tarjetas que están en Deudas se debe reflejar
 * también en Metas del Plan, y la meta actualizarse.»
 *
 * Aquí está la tabla entera: cada clase de movimiento que Deudas puede
 * asentar sobre una tarjeta, y lo que la meta enganchada enseña después. La
 * meta no guarda copia de nada: se calcula de la deuda en cada carga, así que
 * «después del movimiento» es simplemente «con el saldo nuevo».
 */

const HOY = new Date(2026, 10, 13, 12);
const DEUDA = 'd0000000-0000-4000-8000-000000000001';

function meta(over: Partial<FinanceGoal> = {}): FinanceGoal {
  return {
    id: 'g1', name: 'Compras 3650', emoji: '💳', kind: 'debt', targetAmount: 1, savedAmount: 0,
    targetDate: '2027-03-08', priority: 1, monthlyOverride: null, status: 'active', note: null,
    createdAt: '2026-11-08T00:00:00.000Z', debtId: DEUDA, dateFollowsDebt: true, ...over,
  };
}

function planCon(goals: FinanceGoal[]): PlanInput {
  return {
    incomes: [{ id: 'i1', name: 'Sueldo', amount: 5000, frequency: 'monthly', isActive: true, note: null }],
    goals,
    fixedPayments: [],
    groceriesMonthly: 0,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 0,
    now: HOY,
  };
}

/** La meta tal como la enseña el Plan con la deuda en ese estado. */
function enElPlan(deuda: GoalDebtLink, over: Partial<FinanceGoal> = {}) {
  const [g] = buildFinancePlan(planCon([goalWithDebt(meta(over), deuda)])).goals;
  return { llevas: g.savedAmount, de: g.targetAmount, falta: g.remaining, fecha: g.targetDate, estado: g.status };
}

describe('cada movimiento de Deudas mueve la meta', () => {
  // La tarjeta abrió en $1,000 y la meta la sigue desde entonces.
  const base = { originalAmount: 1000, peakBalance: 1000 };

  it('abono: «llevas» sube lo abonado y «falta» baja lo mismo', () => {
    expect(enElPlan({ ...base, currentBalance: 1000, targetDate: '2027-03-08' })).toMatchObject({ llevas: 0, falta: 1000 });
    expect(enElPlan({ ...base, currentBalance: 846, targetDate: '2027-02-08' })).toMatchObject({
      llevas: 154, de: 1000, falta: 846, fecha: '2027-02-08',
    });
  });

  it('consumo: «falta» sube; pasado el objetivo, el objetivo crece con la deuda', () => {
    expect(enElPlan({ ...base, currentBalance: 900 })).toMatchObject({ llevas: 100, falta: 900 });
    expect(enElPlan({ originalAmount: 1000, peakBalance: 1250, currentBalance: 1250 })).toMatchObject({
      llevas: 0, de: 1250, falta: 1250,
    });
  });

  it('interés del ciclo: entra en «falta» como cualquier cargo', () => {
    expect(enElPlan({ ...base, currentBalance: 866.31 })).toMatchObject({ falta: 866.31, llevas: 133.69 });
  });

  it('cuadre con el estado de cuenta: la meta toma el saldo cuadrado, arriba o abajo', () => {
    expect(enElPlan({ ...base, currentBalance: 812.5 }).falta).toBe(812.5);
    expect(enElPlan({ originalAmount: 1000, peakBalance: 1177.04, currentBalance: 1177.04 }).falta).toBe(1177.04);
  });

  it('borrar o corregir un abono: la meta vuelve a donde dice el saldo', () => {
    const conAbono = enElPlan({ ...base, currentBalance: 700 });
    const abonoBorrado = enElPlan({ ...base, currentBalance: 1000 });
    expect([conAbono.llevas, abonoBorrado.llevas]).toEqual([300, 0]);
  });

  it('abono tras una subida por consumos: cuenta entero', () => {
    expect(enElPlan({ originalAmount: 200, peakBalance: 800, currentBalance: 500 })).toMatchObject({
      llevas: 300, de: 800, falta: 500,
    });
  });

  it('liquidarla: la meta queda lograda sola, sin que nadie la marque', () => {
    expect(enElPlan({ ...base, currentBalance: 0 })).toMatchObject({ llevas: 1000, falta: 0, estado: 'done' });
  });

  it('si la tarjeta vuelve a deber, la meta vuelve a estar activa', () => {
    expect(enElPlan({ ...base, currentBalance: 60 })).toMatchObject({ falta: 60, estado: 'active' });
  });

  it('la fecha se mueve con la deuda: un abono la acerca, un consumo la aleja', () => {
    expect(enElPlan({ ...base, currentBalance: 152.04, targetDate: '2026-12-13' }).fecha).toBe('2026-12-13');
    expect(enElPlan({ ...base, currentBalance: 980, targetDate: '2027-06-13' }).fecha).toBe('2027-06-13');
  });
});

describe('el consejero habla de la tarjeta, no de apartar', () => {
  it('una meta de tarjeta en camino dice la cuota y lo que falta, y manda a abonar', () => {
    // El texto de las metas de ahorro daba «Apartando $1 al mes — o $0 por
    // semana — tienes los $553 para el 8 de febrero 2058».
    const g = goalWithDebt(meta(), { originalAmount: 553.4, currentBalance: 523.4, targetDate: '2058-02-08' });
    const plan = buildFinancePlan({
      ...planCon([g]),
      credits: [{
        id: DEUDA, name: 'Saldo nuevo 3650', balance: 523.4, installment: 10.47, monthlyInterest: 10.46,
        monthsToPayoff: 375, neverPaysOff: false,
      }],
    });
    const consejo = plan.advice.find((a) => a.id === 'goal-ok-g1');

    // El consejero habla en dólares enteros, como en el resto de sus tarjetas.
    expect(consejo?.body).toBe(
      'Con la cuota de la tarjeta ($10 al mes) la terminas el 8 de febrero 2058. Faltan $523 y llevas el 5%.',
    );
    expect(consejo?.body).not.toMatch(/Apartando|por semana/);
    expect(consejo?.action).toMatchObject({ label: 'Abonar la tarjeta', kind: 'contribute', goalId: 'g1' });
  });
});

describe('lo que NO cambia solo', () => {
  it('una meta en pausa sigue en pausa aunque la tarjeta quede en cero', () => {
    expect(enElPlan({ originalAmount: 1000, currentBalance: 0 }, { status: 'paused' }).estado).toBe('paused');
  });

  it('una meta de ahorro (sin tarjeta) al 100 % espera el toque de su dueño', () => {
    const [g] = buildFinancePlan(planCon([meta({ debtId: null, targetAmount: 500, savedAmount: 500 })])).goals;
    expect(g.status).toBe('active');
    expect(g.feasibility).toBe('done');
  });

  it('la fecha que escribió el dueño aguanta abonos y consumos', () => {
    const propia = { dateFollowsDebt: false, targetDate: '2027-06-30' };
    expect(enElPlan({ originalAmount: 1000, currentBalance: 400, targetDate: '2026-12-13' }, propia).fecha).toBe('2027-06-30');
  });
});
