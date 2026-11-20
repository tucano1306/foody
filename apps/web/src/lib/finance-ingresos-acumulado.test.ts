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
 * «Este mes solo he ingresado $1,240.»
 *
 * El modal decía «Entra este mes $4,005». Los $27,654.50 de Repartos se
 * apuntaron el 30 de agosto: cubren enero–agosto. Pero la app los dividía
 * entre los meses que iban HOY (10) y sumaba esos $2,765 a octubre como si el
 * trabajo siguiera pagando. Un acumulado es una foto: cuenta el mes en que se
 * apunta y su media sale de los meses que cubre.
 *
 * Los ingresos de abajo repiten la forma del caso del dueño el 18 oct 2026
 * —un acumulado de enero–agosto, un cheque de septiembre y dos pagos sueltos
 * del mismo cliente, uno en septiembre y otro en octubre—, pero los nombres y
 * los importes son inventados: este repo es público.
 */
const OCT = new Date(2026, 9, 18, 12);

function ingreso(over: Partial<IncomeSource>): IncomeSource {
  return { id: 'x', name: 'x', amount: 0, frequency: 'monthly', isActive: true, note: null, ...over };
}

const repartos = ingreso({ id: 'repartos', name: 'Repartos', amount: 27654.5, frequency: 'ytd', asOf: '2026-08-30' });
const fletes = ingreso({ id: 'fl', name: 'Fletes al norte', amount: 2870, frequency: 'one_time', receivedOn: '2026-09-17' });
const clienteSep = ingreso({ id: 't1', name: 'Bravatec', amount: 90, frequency: 'one_time', receivedOn: '2026-09-28' });
const clienteOct = ingreso({ id: 't2', name: 'Bravatec', amount: 1240, frequency: 'one_time', receivedOn: '2026-10-16' });
const DUENO = [repartos, fletes, clienteSep, clienteOct];

describe('un acumulado del año es una foto', () => {
  it('su media sale de los meses que cubre, no de los que van hoy', () => {
    expect(ytdMonthsCovered(repartos, OCT)).toBe(8);
    expect(monthlyRate(repartos, OCT)).toBeCloseTo(3456.81, 2);
  });

  it('cuenta el mes en que se apuntó, y no los siguientes', () => {
    expect(countsInMonth(repartos, new Date(2026, 7, 31))).toBe(true);
    expect(countsInMonth(repartos, OCT)).toBe(false);
    expect(incomeThisMonth(repartos, OCT)).toBe(0);
    expect(totalMonthlyIncome([repartos], OCT)).toBe(0);
  });

  it('actualizado este mes, vuelve a contar con su media nueva', () => {
    const alDia = { ...repartos, amount: 35000, asOf: '2026-10-18' };
    expect(countsInMonth(alDia, OCT)).toBe(true);
    expect(monthlyRate(alDia, OCT)).toBe(3500);
    expect(totalMonthlyIncome([alDia], OCT)).toBe(3500);
  });

  it('sin fecha (los de antes de guardarla) se comporta como siempre', () => {
    const viejo = { ...repartos, asOf: undefined };
    expect(countsInMonth(viejo, OCT)).toBe(true);
    expect(monthlyRate(viejo, OCT)).toBeCloseTo(2765.45, 2);
  });

  it('apagado no cuenta nunca', () => {
    expect(countsInMonth({ ...repartos, asOf: '2026-10-01', isActive: false }, OCT)).toBe(false);
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

  it('entran $1,240: lo cobrado de verdad', () => {
    expect(cashFlow.monthlyIncome).toBe(1240);
    expect(cashFlow.oneTimeIncome).toBe(1240);
    expect(cashFlow.recurringIncome).toBe(0);
  });

  it('septiembre no se cuela en octubre', () => {
    expect(totalOneTimeIncome(DUENO, OCT)).toBe(1240);
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
    expect(items.incomeItems.map((i) => [i.label, i.amount])).toEqual([['Bravatec', 1240]]);
    expect(items.income).toBe(1240);
  });
});
