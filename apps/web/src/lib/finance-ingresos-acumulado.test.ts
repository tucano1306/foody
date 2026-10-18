import { describe, expect, it } from 'vitest';
import {
  buildFinancePlan,
  countsInMonth,
  incomeThisMonth,
  monthlyRate,
  totalMonthlyIncome,
  totalOneTimeIncome,
  ytdMonthsCovered,
  type IncomeSource,
} from './finance-engine';
import { itemizeScope } from './scope-items';

/**
 * «Este mes solo he ingresado $1,386.»
 *
 * El modal decía «Entra este mes $4,526». Los $31,397.50 de Como Driver se
 * apuntaron el 30 de agosto: cubren enero–agosto. Pero la app los dividía
 * entre los meses que iban HOY (10) y sumaba esos $3,140 a octubre como si el
 * trabajo siguiera pagando. Un acumulado es una foto: cuenta el mes en que se
 * apunta y su media sale de los meses que cubre.
 *
 * Los ingresos de abajo son los del dueño, tal como estaban el 18 oct 2026.
 */
const OCT = new Date(2026, 9, 18, 12);

function ingreso(over: Partial<IncomeSource>): IncomeSource {
  return { id: 'x', name: 'x', amount: 0, frequency: 'monthly', isActive: true, note: null, ...over };
}

const driver = ingreso({ id: 'driver', name: 'Como Driver', amount: 31397.5, frequency: 'ytd', asOf: '2026-08-30' });
const georgia = ingreso({ id: 'ga', name: 'Cargas a Georgia', amount: 3311, frequency: 'one_time', receivedOn: '2026-09-17' });
const tecnoSep = ingreso({ id: 't1', name: 'Tecnofuel', amount: 65, frequency: 'one_time', receivedOn: '2026-09-28' });
const tecnoOct = ingreso({ id: 't2', name: 'Tecnofuel', amount: 1386, frequency: 'one_time', receivedOn: '2026-10-16' });
const DUENO = [driver, georgia, tecnoSep, tecnoOct];

describe('un acumulado del año es una foto', () => {
  it('su media sale de los meses que cubre, no de los que van hoy', () => {
    expect(ytdMonthsCovered(driver, OCT)).toBe(8);
    expect(monthlyRate(driver, OCT)).toBeCloseTo(3924.69, 2);
  });

  it('cuenta el mes en que se apuntó, y no los siguientes', () => {
    expect(countsInMonth(driver, new Date(2026, 7, 31))).toBe(true);
    expect(countsInMonth(driver, OCT)).toBe(false);
    expect(incomeThisMonth(driver, OCT)).toBe(0);
    expect(totalMonthlyIncome([driver], OCT)).toBe(0);
  });

  it('actualizado este mes, vuelve a contar con su media nueva', () => {
    const alDia = { ...driver, amount: 35000, asOf: '2026-10-18' };
    expect(countsInMonth(alDia, OCT)).toBe(true);
    expect(monthlyRate(alDia, OCT)).toBe(3500);
    expect(totalMonthlyIncome([alDia], OCT)).toBe(3500);
  });

  it('sin fecha (los de antes de guardarla) se comporta como siempre', () => {
    const viejo = { ...driver, asOf: undefined };
    expect(countsInMonth(viejo, OCT)).toBe(true);
    expect(monthlyRate(viejo, OCT)).toBeCloseTo(3139.75, 2);
  });

  it('apagado no cuenta nunca', () => {
    expect(countsInMonth({ ...driver, asOf: '2026-10-01', isActive: false }, OCT)).toBe(false);
  });

  it('lo que se repite sigue contando todos los meses', () => {
    const sueldo = ingreso({ amount: 3000 });
    expect(countsInMonth(sueldo, OCT)).toBe(true);
    expect(totalMonthlyIncome([sueldo], OCT)).toBe(3000);
  });
});

describe('el Plan de octubre del dueño', () => {
  const { cashFlow } = buildFinancePlan({
    incomes: DUENO,
    goals: [],
    fixedPayments: [],
    groceriesMonthly: 0,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 0,
    now: OCT,
  });

  it('entran $1,386: lo cobrado de verdad', () => {
    expect(cashFlow.monthlyIncome).toBe(1386);
    expect(cashFlow.oneTimeIncome).toBe(1386);
    expect(cashFlow.recurringIncome).toBe(0);
  });

  it('septiembre no se cuela en octubre', () => {
    expect(totalOneTimeIncome(DUENO, OCT)).toBe(1386);
  });

  it('el reparto personal / negocio enseña las mismas líneas que suma', () => {
    const items = itemizeScope(
      {
        incomes: DUENO,
        fixedPayments: [],
        credits: [],
        groceriesMonthly: 0,
        groceriesBusinessShare: 0,
        otherExpensesMonthly: 0,
        otherBusinessShare: 0,
        now: OCT,
      },
      'personal',
    );
    expect(items.incomeItems.map((i) => [i.label, i.amount])).toEqual([['Tecnofuel', 1386]]);
    expect(items.income).toBe(1386);
  });
});
