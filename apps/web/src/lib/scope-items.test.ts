import { describe, it, expect } from 'vitest';
import { itemizeScope, type ScopeItemsInput } from './scope-items';
import { buildFinancePlan } from './finance-engine';
import type { CreditInput, FixedPaymentInput, IncomeSource } from './finance-engine';

function payment(over: Partial<FixedPaymentInput> = {}): FixedPaymentInput {
  return {
    id: 'p1', name: 'Mortgage', amount: 917, dueDay: 3,
    isPaidThisMonth: false, missedMonths: 0, accumulatedDebt: 0, businessShare: 0,
    ...over,
  };
}

function credit(over: Partial<CreditInput> = {}): CreditInput {
  return {
    id: 'c1', name: 'Visa', balance: 1000, installment: 200,
    monthlyInterest: 10, monthsToPayoff: 6, neverPaysOff: false, businessShare: 0,
    ...over,
  };
}

function income(over: Partial<IncomeSource> = {}): IncomeSource {
  return { id: 'i1', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null, ...over };
}

/** La foto real del usuario, simplificada: lo que producía el «$4,444». */
function input(over: Partial<ScopeItemsInput> = {}): ScopeItemsInput {
  return {
    incomes: [],
    fixedPayments: [
      payment({ id: 'p-mort', name: 'Mortgage', amount: 917, businessShare: 0 }),
      payment({ id: 'p-hoa', name: 'HOA Bucley tower', amount: 551, businessShare: 0 }),
      payment({ id: 'p-gmc', name: 'GMC', amount: 1097, businessShare: 100 }),
      payment({ id: 'p-cable', name: 'Cable insurance', amount: 917, businessShare: 100 }),
    ],
    credits: [
      credit({ id: 'c-auto', name: 'Auto', installment: 1097, businessShare: 100, linkedPaymentId: 'p-gmc' }),
      credit({ id: 'c-visa', name: 'Visa travel', installment: 200, businessShare: 0 }),
    ],
    groceriesMonthly: 245,
    groceriesBusinessShare: 0,
    otherExpensesMonthly: 43,
    otherBusinessShare: 0,
    ...over,
  };
}

describe('itemizeScope — de dónde sale la cifra', () => {
  it('el total personal cuadra con la suma de sus líneas', () => {
    const r = itemizeScope(input(), 'personal');
    const suma = r.expenseGroups.flatMap((g) => g.items).reduce((s, i) => s + i.amount, 0);
    expect(r.expenses).toBeCloseTo(suma, 2);
    // 917 + 551 (recibos) + 200 (visa) + 245 (super) + 43 (otros)
    expect(r.expenses).toBe(1956);
  });

  it('el total del negocio también', () => {
    const r = itemizeScope(input(), 'business');
    // 1097 (GMC) + 917 (cable). La cuota del Auto NO: ya la cobra el recibo GMC.
    expect(r.expenses).toBe(2014);
  });

  it('excluye la cuota que ya cobra un recibo de Pagos', () => {
    const r = itemizeScope(input(), 'business');
    const ids = r.expenseGroups.flatMap((g) => g.items).map((i) => i.id);
    expect(ids).not.toContain('credit-c-auto');
    expect(ids).toContain('payment-p-gmc');
  });

  it('pero la vuelve a contar si el recibo enlazado ya no existe', () => {
    const r = itemizeScope(
      input({ fixedPayments: [payment({ id: 'otro', name: 'Otro', amount: 10 })] }),
      'business',
    );
    expect(r.expenseGroups.flatMap((g) => g.items).map((i) => i.id)).toContain('credit-c-auto');
  });

  it('un gasto mixto aparece en los DOS lados, cada uno con su parte', () => {
    const mixto = input({
      fixedPayments: [payment({ id: 'p-mix', name: 'Coche', amount: 1000, businessShare: 60 })],
      credits: [],
      groceriesMonthly: 0,
      otherExpensesMonthly: 0,
    });
    const personal = itemizeScope(mixto, 'personal').expenseGroups[0].items[0];
    const negocio = itemizeScope(mixto, 'business').expenseGroups[0].items[0];

    expect(personal.amount).toBe(400);
    expect(personal.sharePct).toBe(40);
    expect(negocio.amount).toBe(600);
    expect(negocio.sharePct).toBe(60);
    // El importe completo se conserva para poder decir «$600 de $1,000».
    expect(personal.fullAmount).toBe(1000);
    expect(personal.isSplit).toBe(true);
    expect(negocio.isSplit).toBe(true);
  });

  it('un gasto de un solo lado no se marca como repartido', () => {
    const r = itemizeScope(input(), 'personal');
    const mort = r.expenseGroups.flatMap((g) => g.items).find((i) => i.id === 'payment-p-mort');
    expect(mort?.isSplit).toBe(false);
    expect(mort?.sharePct).toBe(100);
  });

  it('no lista líneas que aportan cero a este lado', () => {
    const r = itemizeScope(input(), 'business');
    const ids = r.expenseGroups.flatMap((g) => g.items).map((i) => i.id);
    // Mortgage es 100 % personal: no tiene nada que hacer en el lado negocio.
    expect(ids).not.toContain('payment-p-mort');
    expect(ids).not.toContain('grocery');
  });

  it('agrupa por bloque y pone el más caro primero', () => {
    const r = itemizeScope(input(), 'personal');
    const totales = r.expenseGroups.map((g) => g.total);
    expect([...totales].sort((a, b) => b - a)).toEqual(totales);
    expect(r.expenseGroups[0].key).toBe('payment');
  });

  it('dentro de cada bloque, la línea más cara primero', () => {
    const r = itemizeScope(input(), 'personal');
    const pagos = r.expenseGroups.find((g) => g.key === 'payment')!;
    expect(pagos.items.map((i) => i.label)).toEqual(['Mortgage', 'HOA Bucley tower']);
  });

  it('reparte los ingresos con su propio porcentaje y su frecuencia', () => {
    const r = itemizeScope(
      input({ incomes: [income({ amount: 1000, frequency: 'biweekly', businessShare: 50 })] }),
      'business',
    );
    // 1000 quincenal = 2166.67 al mes; la mitad es del negocio.
    expect(r.income).toBeCloseTo(1083.33, 1);
    expect(r.incomeItems[0].isSplit).toBe(true);
  });

  it('ignora los ingresos inactivos', () => {
    const r = itemizeScope(input({ incomes: [income({ isActive: false })] }), 'personal');
    expect(r.incomeItems).toEqual([]);
    expect(r.income).toBe(0);
  });

  it('sin nada cargado no inventa filas', () => {
    const vacio = itemizeScope(
      {
        incomes: [], fixedPayments: [], credits: [],
        groceriesMonthly: 0, groceriesBusinessShare: 0,
        otherExpensesMonthly: 0, otherBusinessShare: 0,
      },
      'personal',
    );
    expect(vacio.expenses).toBe(0);
    expect(vacio.expenseGroups).toEqual([]);
    expect(vacio.incomeItems).toEqual([]);
  });

  it('los dos lados suman siempre el total sin repartir', () => {
    // La propiedad que hace que el desglose sea creíble: nada se pierde ni se
    // duplica al partir por porcentaje.
    const base = input({ groceriesBusinessShare: 30, otherBusinessShare: 70 });
    const p = itemizeScope(base, 'personal').expenses;
    const b = itemizeScope(base, 'business').expenses;
    // 917 + 551 + 1097 + 917 (recibos) + 200 (visa) + 245 + 43
    expect(p + b).toBeCloseTo(3970, 2);
  });

  it('trata los importes negativos como cero', () => {
    const r = itemizeScope(
      input({
        fixedPayments: [payment({ id: 'p-neg', amount: -50 })],
        credits: [], groceriesMonthly: 0, otherExpensesMonthly: 0,
      }),
      'personal',
    );
    expect(r.expenses).toBe(0);
  });
});

describe('el desglose CUADRA con la cifra que acompaña', () => {
  // La propiedad que sostiene toda la pantalla: si la hoja sumara distinto que
  // la tarjeta que se acaba de tocar, el desglose no explicaría nada — daría
  // una tercera cifra que confundiría más que el número original.
  const NOW = new Date(2026, 7, 8, 12, 0, 0);

  function planFrom(i: ScopeItemsInput) {
    return buildFinancePlan({
      incomes: i.incomes,
      goals: [],
      fixedPayments: i.fixedPayments,
      credits: i.credits,
      groceriesMonthly: i.groceriesMonthly,
      groceriesSource: 'pace',
      groceriesSpentThisMonth: 0,
      groceriesBusinessShare: i.groceriesBusinessShare,
      otherExpensesMonthly: i.otherExpensesMonthly,
      otherBusinessShare: i.otherBusinessShare,
      now: NOW,
    });
  }

  const escenarios: [string, ScopeItemsInput][] = [
    ['la foto real del usuario', input()],
    ['con ingresos repartidos', input({ incomes: [income({ businessShare: 40 })] })],
    ['con super y otros del negocio', input({ groceriesBusinessShare: 30, otherBusinessShare: 70 })],
    ['con un pago mixto', input({
      fixedPayments: [payment({ id: 'p-mix', amount: 800, businessShare: 55 })],
      credits: [],
    })],
    ['sin nada del negocio', input({
      fixedPayments: [payment()],
      credits: [credit()],
      groceriesBusinessShare: 0,
      otherBusinessShare: 0,
    })],
    ['todo del negocio', input({
      fixedPayments: [payment({ businessShare: 100 })],
      credits: [credit({ businessShare: 100 })],
      groceriesBusinessShare: 100,
      otherBusinessShare: 100,
    })],
  ];

  for (const [nombre, i] of escenarios) {
    it(`coincide con el motor: ${nombre}`, () => {
      const { scopes } = planFrom(i);
      expect(itemizeScope(i, 'personal').expenses).toBeCloseTo(scopes.personal.expenses, 2);
      expect(itemizeScope(i, 'business').expenses).toBeCloseTo(scopes.business.expenses, 2);
      expect(itemizeScope(i, 'personal').income).toBeCloseTo(scopes.personal.income, 2);
      expect(itemizeScope(i, 'business').income).toBeCloseTo(scopes.business.income, 2);
    });
  }
});
