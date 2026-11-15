import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFinancePlan, type CreditInput, type PlanInput } from '@/lib/finance-engine';
import CashFlowCard from './CashFlowCard';

const NOW = new Date(2026, 10, 15, 12); // 15 nov 2026

/**
 * Una tarjeta al 0 % que el plan quiere liquidar en tres meses: cuota de
 * $3,000 sobre un mínimo del banco de $90. Cifras inventadas y redondas.
 */
const TARJETA: CreditInput = {
  id: 'c1',
  name: 'Tarjeta al 0 %',
  balance: 9000,
  installment: 3000,
  monthlyInterest: 0,
  monthsToPayoff: 3,
  neverPaysOff: false,
  minimumPayment: 90,
};

const SUELDO = { id: 'i1', name: 'Sueldo', amount: 3000, frequency: 'monthly' as const, isActive: true, note: null };

/** Con el motor de verdad: la tarjeta no puede decir otra cosa que el plan. */
function planInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    incomes: [SUELDO],
    goals: [],
    fixedPayments: [
      { id: 'p1', name: 'Renta', amount: 900, dueDay: 5, isPaidThisMonth: true, missedMonths: 0, accumulatedDebt: 0 },
    ],
    groceriesMonthly: 400,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 180,
    now: NOW,
    ...over,
  };
}

function montar(over: Partial<PlanInput> = {}, creditsBusinessExcluded = 0) {
  const cash = buildFinancePlan(planInput(over)).cashFlow;
  const handlers = {
    onOpenIncome: vi.fn(),
    onOpenPayments: vi.fn(),
    onOpenBudget: vi.fn(),
    onOpenDebts: vi.fn(),
    onOpenTrips: vi.fn(),
  };
  render(
    <CashFlowCard
      cash={cash}
      groceriesSource="limit"
      creditsBusinessExcluded={creditsBusinessExcluded}
      {...handlers}
    />,
  );
  return { cash, ...handlers };
}

/** El importe de una fila de la cascada, por su etiqueta. */
function importeDe(etiqueta: string): string {
  const fila = screen.getByText(etiqueta).closest('button') as HTMLElement;
  return fila.querySelector('.tabular-nums')?.textContent ?? '';
}

/**
 * «Tu mes» restaba la cuota entera de una tarjeta al 0 % —la del plan para
 * liquidarla a tiempo— como si la pidiera el banco, y el mes salía en rojo a
 * quien solo debía el mínimo. La cascada para en lo que PIDE el mes; lo que el
 * plan abona de más va debajo, con su nombre.
 */
describe('CashFlowCard — lo que pide el mes y lo que abonas de más', () => {
  it('la fila de tarjetas resta lo que pide el banco, no la cuota del plan', () => {
    montar({ credits: [TARJETA] });
    expect(importeDe('Tarjetas y créditos')).toBe('−$90');
    expect(screen.getByText(/lo que pide el banco/)).toBeInTheDocument();
  });

  it('lo libre es lo que queda tras lo que pide el mes', () => {
    montar({ credits: [TARJETA] });
    // $3,000 − $900 de renta − $400 de super − $90 de mínimo.
    expect(screen.getByText('Te queda libre')).toBeInTheDocument();
    expect(screen.getByText('$1,610')).toBeInTheDocument();
  });

  it('el abono de más va aparte, con su cifra, y lleva a Deudas', () => {
    const { onOpenDebts } = montar({ credits: [TARJETA] });
    const linea = screen.getByRole('button', { name: /Abonos de más a tarjetas/ });
    expect(linea).toHaveTextContent('$2,910');

    fireEvent.click(linea);
    expect(onOpenDebts).toHaveBeenCalled();
  });

  it('el plan se come lo libre: para metas no queda nada, y lo dice', () => {
    montar({ credits: [TARJETA] });
    expect(screen.getByText('Para metas').nextElementSibling).toHaveTextContent('$0');
  });

  it('sin abonos de más no hay línea que explicar', () => {
    montar({ credits: [{ ...TARJETA, installment: 90 }] });
    expect(screen.queryByRole('button', { name: /Abonos de más/ })).toBeNull();
  });

  it('con cuotas del negocio fuera, lo dice en la fila', () => {
    montar({ credits: [TARJETA] }, 45);
    expect(screen.getByText(/solo tu parte personal · \$45 del negocio fuera/)).toBeInTheDocument();
  });

  it('ponerse al día sale de lo libre: va debajo y no descuadra la cascada', () => {
    const { onOpenPayments } = montar({
      fixedPayments: [
        { id: 'p1', name: 'Renta', amount: 900, dueDay: 5, isPaidThisMonth: true, missedMonths: 0, accumulatedDebt: 0 },
        { id: 'p2', name: 'Internet', amount: 100, dueDay: 10, isPaidThisMonth: false, missedMonths: 6, accumulatedDebt: 600 },
      ],
    });
    // $3,000 − $1,000 de recibos − $400 de super: lo libre no resta la reserva.
    expect(screen.getByText('$1,600')).toBeInTheDocument();
    // $600 atrasados en tres meses.
    const linea = screen.getByRole('button', { name: /Ponerse al día/ });
    expect(linea).toHaveTextContent('$200');
    fireEvent.click(linea);
    expect(onOpenPayments).toHaveBeenCalled();
  });
});

describe('CashFlowCard — cuando no alcanza', () => {
  it('con ingreso suelto, a mitad de mes faltan cheques: «Faltan por cobrar»', () => {
    montar({
      incomes: [
        { id: 'i2', name: 'Cheque', amount: 1000, frequency: 'one_time', isActive: true, note: null, receivedOn: '2026-11-03' },
      ],
    });
    // $1,000 cobrados − $900 − $400.
    expect(screen.getByText('Faltan por cobrar')).toBeInTheDocument();
    expect(screen.getByText('$300')).toBeInTheDocument();
    expect(screen.queryByText('Te falta cada mes')).toBeNull();
  });

  it('con sueldo fijo, el mismo hueco es un mes que no cierra', () => {
    montar({ incomes: [{ ...SUELDO, amount: 1000 }] });
    expect(screen.getByText('Te falta cada mes')).toBeInTheDocument();
    expect(screen.getByText('$300')).toBeInTheDocument();
  });
});
