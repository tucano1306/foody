import { describe, expect, it } from 'vitest';
import { buildFinancePlan, personalOnlyInput, type PlanInput } from './finance-engine';
import { computeGroceryInsight } from './grocery-insights';
import { computeOtherSpend } from './other-spend';

/**
 * «Tu mes» decía «Super −$X» y la tarjeta de comida, justo debajo, «Llevas $Y»
 * con Y menor. Las dos cifras eran ciertas —una es lo que el plan resta por el
 * mes entero, la otra lo ya gastado— pero nada en la pantalla lo decía, y el
 * dueño leyó que la app sumaba mal.
 *
 * El motor da ahora las dos: lo que llevas (`groceriesSpent`, `otherSpent`) y
 * lo que resta el plan (`groceriesEstimate`, `otherExpenses`). La diferencia es
 * lo previsto hasta fin de mes. Lo libre sigue restando el mes entero: si solo
 * restara lo gastado, el día 1 el plan repartiría entre metas el super de todo
 * el mes.
 *
 * Cifras inventadas y redondas.
 */

// Día 20 de un mes de 30: quedan 10 días, un tercio.
const NOW = new Date(2026, 10, 20, 12);

const SUPER = computeGroceryInsight({
  // Dos meses cerrados de $200 y $240 llevados en este.
  monthlyTotals: [
    { month: '2026-09', total: 200, trips: 4 },
    { month: '2026-10', total: 200, trips: 4 },
    { month: '2026-11', total: 240, trips: 5 },
  ],
  categories: [],
  stores: [],
  limit: 0,
  now: NOW,
});

const FUERA = computeOtherSpend({
  // Dos meses cerrados de $300 y $150 llevados en este.
  monthlyTotals: [
    { month: '2026-09', total: 300, trips: 6 },
    { month: '2026-10', total: 300, trips: 6 },
    { month: '2026-11', total: 150, trips: 3 },
  ],
  byKind: [],
  places: [],
  now: NOW,
});

function plan(over: Partial<PlanInput> = {}): PlanInput {
  return {
    incomes: [{ id: 'i1', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null }],
    goals: [],
    fixedPayments: [],
    groceries: SUPER,
    groceriesMonthly: SUPER.baseline,
    groceriesSource: SUPER.baselineSource,
    groceriesSpentThisMonth: SUPER.spentThisMonth,
    otherSpend: FUERA,
    otherExpensesMonthly: FUERA.baseline,
    now: NOW,
    ...over,
  };
}

describe('«Tu mes»: lo que llevas y lo que resta el plan', () => {
  it('el super trae lo que llevas, el mismo «Llevas» de la tarjeta de comida', () => {
    const { cashFlow } = buildFinancePlan(plan());
    expect(cashFlow.groceriesSpent).toBe(240);
    expect(cashFlow.groceriesSpent).toBe(SUPER.spentThisMonth);
  });

  it('lo que resta es lo que llevas más tu promedio en los días que faltan', () => {
    const { cashFlow } = buildFinancePlan(plan());
    // $240 llevados + $200 de promedio × 10/30 días que faltan.
    expect(cashFlow.groceriesEstimate).toBeCloseTo(306.67, 2);
    expect(cashFlow.groceriesEstimate - cashFlow.groceriesSpent).toBeCloseTo(66.67, 2);
  });

  it('fuera del super, lo mismo: el «Llevas» de su tarjeta y lo previsto aparte', () => {
    const { cashFlow } = buildFinancePlan(plan());
    expect(cashFlow.otherSpent).toBe(150);
    expect(cashFlow.otherSpent).toBe(FUERA.spentThisMonth);
    // $150 llevados + $300 de promedio × 10/30.
    expect(cashFlow.otherExpenses).toBe(250);
  });

  it('lo libre sigue restando el mes entero, no solo lo gastado', () => {
    const { cashFlow } = buildFinancePlan(plan());
    expect(cashFlow.afterObligations).toBeCloseTo(3000 - 306.67 - 250, 2);
  });

  it('a principio de mes, sin compras: llevas $0 y el plan aparta tu promedio', () => {
    const dia1 = new Date(2026, 10, 1, 12);
    const vacio = computeGroceryInsight({
      monthlyTotals: [
        { month: '2026-09', total: 200, trips: 4 },
        { month: '2026-10', total: 200, trips: 4 },
      ],
      categories: [],
      stores: [],
      limit: 0,
      now: dia1,
    });
    const { cashFlow } = buildFinancePlan(plan({
      groceries: vacio,
      groceriesMonthly: vacio.baseline,
      groceriesSource: vacio.baselineSource,
      groceriesSpentThisMonth: vacio.spentThisMonth,
      otherSpend: undefined,
      otherExpensesMonthly: 0,
      now: dia1,
    }));
    expect(cashFlow.groceriesSpent).toBe(0);
    expect(cashFlow.groceriesEstimate).toBe(200);
  });

  it('sin el panorama de fuera del super, no se inventa lo gastado', () => {
    const { cashFlow } = buildFinancePlan(plan({ otherSpend: undefined }));
    expect(cashFlow.otherSpent).toBe(0);
    expect(cashFlow.otherExpenses).toBe(250);
  });

  it('nunca enseña más gastado que lo que resta: lo previsto no sale negativo', () => {
    // Una entrada incoherente —gastado por encima del estimado— no puede
    // pintar «+−$20 previstos».
    const { cashFlow } = buildFinancePlan(plan({ groceriesMonthly: 220 }));
    expect(cashFlow.groceriesSpent).toBe(220);
    expect(cashFlow.groceriesEstimate).toBe(220);
  });
});

describe('«Tu mes» con el negocio apagado', () => {
  const mixto = plan({ groceriesBusinessShare: 25, otherBusinessShare: 50 });

  it('lo que llevas se reparte igual que lo que resta', () => {
    const { cashFlow } = buildFinancePlan(personalOnlyInput(mixto));
    expect(cashFlow.groceriesSpent).toBe(180);
    expect(cashFlow.otherSpent).toBe(75);
    expect(cashFlow.groceriesEstimate).toBeCloseTo(230, 2);
    expect(cashFlow.otherExpenses).toBe(125);
  });

  it('el plan completo sigue con todo, y la diferencia es la parte del negocio', () => {
    const completo = buildFinancePlan(mixto).cashFlow;
    const personal = buildFinancePlan(personalOnlyInput(mixto)).cashFlow;
    expect(completo.groceriesSpent - personal.groceriesSpent).toBe(60);
    expect(completo.otherSpent - personal.otherSpent).toBe(75);
  });
});
