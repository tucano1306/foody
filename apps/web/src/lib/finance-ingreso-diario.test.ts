import { describe, expect, it } from 'vitest';
import {
  buildFinancePlan,
  totalOneTimeIncome,
  type FixedPaymentInput,
  type IncomeSource,
  type PlanInput,
} from './finance-engine';

/**
 * «¿Y si meto ingresos a diario?»
 *
 * El caso: se cobra un cheque hoy, otro pasado mañana, otro la semana que
 * viene. Cada uno se anota cuando entra y el plan tiene que ir sumando sin que
 * haya que tocar nada mas.
 */
const cobro = (id: string, amount: number, receivedOn: string): IncomeSource => ({
  id, name: `Cobro ${id}`, amount, frequency: 'one_time', isActive: true, note: null, receivedOn,
});

function plan(incomes: IncomeSource[], now: Date): PlanInput {
  return {
    incomes,
    goals: [],
    fixedPayments: [],
    groceriesMonthly: 0,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 0,
    now,
  };
}

describe('meter ingresos a diario', () => {
  // Nueve cobros de agosto, uno por dia, con centavos que no se redondean bien
  // a proposito: la suma tiene que ser exacta al centavo.
  const AGOSTO: IncomeSource[] = [
    cobro('a', 320.15, '2026-08-01'),
    cobro('b', 118.7, '2026-08-04'),
    cobro('c', 940.33, '2026-08-07'),
    cobro('d', 55.05, '2026-08-11'),
    cobro('e', 1210.9, '2026-08-14'),
    cobro('f', 77.77, '2026-08-19'),
    cobro('g', 402.6, '2026-08-24'),
    cobro('h', 88.88, '2026-08-28'),
    cobro('i', 1500, '2026-08-30'),
  ];
  const TOTAL = 4714.38;

  it('cada cobro que entra se suma al total del mes', () => {
    // Se anota uno a uno, como pasa de verdad: el total sube en cada alta.
    let acumulado = 0;
    const cargados: IncomeSource[] = [];
    for (const c of AGOSTO) {
      cargados.push(c);
      acumulado += c.amount;
      const { cashFlow } = buildFinancePlan(plan([...cargados], new Date(2026, 7, 30)));
      expect(cashFlow.monthlyIncome).toBeCloseTo(acumulado, 2);
    }
    expect(acumulado).toBeCloseTo(TOTAL, 2);
  });

  it('la suma es exacta al centavo, no arrastra error de flotante', () => {
    expect(totalOneTimeIncome(AGOSTO, new Date(2026, 7, 30))).toBeCloseTo(TOTAL, 2);
  });

  it('varios cobros del mismo dia cuentan los dos', () => {
    const mismoDia = [cobro('x', 200, '2026-08-30'), cobro('y', 350, '2026-08-30')];
    expect(totalOneTimeIncome(mismoDia, new Date(2026, 7, 30))).toBe(550);
  });

  it('lo que queda libre se mueve con cada cobro', () => {
    const renta: FixedPaymentInput = {
      id: 'p', name: 'Renta', amount: 1200, dueDay: 1,
      isPaidThisMonth: false, missedMonths: 0, accumulatedDebt: 0,
    };
    const gastos = { fixedPayments: [renta], groceriesMonthly: 300 };
    const uno = buildFinancePlan({ ...plan([AGOSTO[0]], new Date(2026, 7, 30)), ...gastos });
    const todos = buildFinancePlan({ ...plan(AGOSTO, new Date(2026, 7, 30)), ...gastos });
    expect(todos.cashFlow.available - uno.cashFlow.available).toBeCloseTo(TOTAL - 320.15, 2);
  });

  it('al cambiar de mes los de agosto dejan de contar, sin borrarlos', () => {
    // Es lo correcto: ese dinero ya entró y ya se gastó su mes. Pero conviene
    // saberlo, porque el 1 de septiembre el ingreso del mes arranca en cero.
    const { cashFlow } = buildFinancePlan(plan(AGOSTO, new Date(2026, 8, 1)));
    expect(cashFlow.monthlyIncome).toBe(0);
  });

  it('un cobro de septiembre cuenta en septiembre y no antes', () => {
    const sept = [...AGOSTO, cobro('j', 600, '2026-09-02')];
    expect(totalOneTimeIncome(sept, new Date(2026, 7, 30))).toBeCloseTo(TOTAL, 2);
    expect(totalOneTimeIncome(sept, new Date(2026, 8, 2))).toBe(600);
  });

  it('los cobros sueltos conviven con un sueldo fijo sin pisarse', () => {
    const sueldo: IncomeSource = {
      id: 's', name: 'Sueldo', amount: 1800, frequency: 'monthly', isActive: true, note: null,
    };
    const { cashFlow } = buildFinancePlan(plan([sueldo, ...AGOSTO], new Date(2026, 7, 30)));
    expect(cashFlow.recurringIncome).toBe(1800);
    expect(cashFlow.oneTimeIncome).toBeCloseTo(TOTAL, 2);
    expect(cashFlow.monthlyIncome).toBeCloseTo(1800 + TOTAL, 2);
  });
});
