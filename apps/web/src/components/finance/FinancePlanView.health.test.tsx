import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FinancePlanPayload } from '@/lib/finance-data';
import { buildFinancePlan, type PlanInput } from '@/lib/finance-engine';
import { EMPTY_GROCERY_INSIGHT } from '@/lib/grocery-insights';
import { EMPTY_OTHER_SPEND } from '@/lib/other-spend';
import FinancePlanView from './FinancePlanView';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date(2026, 8, 20, 12, 0, 0); // 20 sep 2026

const INPUT: PlanInput = {
  incomes: [{ id: 'i1', name: 'Sueldo', amount: 3000, frequency: 'monthly', isActive: true, note: null }],
  goals: [],
  fixedPayments: [
    { id: 'p1', name: 'Renta', amount: 900, dueDay: 5, isPaidThisMonth: true, missedMonths: 0, accumulatedDebt: 0 },
  ],
  groceriesMonthly: 400,
  groceriesSource: 'limit',
  groceriesSpentThisMonth: 180,
  now: NOW,
};

function payload(): FinancePlanPayload {
  return {
    ...buildFinancePlan(INPUT),
    incomes: [...INPUT.incomes],
    rawGoals: [],
    contributions: [],
    groceries: { ...EMPTY_GROCERY_INSIGHT },
    otherSpend: { ...EMPTY_OTHER_SPEND },
    groceriesBusinessShare: 0,
    otherBusinessShare: 0,
    duplicateObligations: [],
    history: [],
    payments: [...INPUT.fixedPayments],
    credits: [],
  };
}

/**
 * «Esa sección debe ser tocable.»
 *
 * El anillo de salud era el elemento más grande de la pantalla y el único sin
 * respuesta: un veredicto en una palabra, sin decir qué mide ni de qué mes
 * habla. Estas pruebas fijan las dos mitades del arreglo —que se pueda tocar,
 * y que lo que se abre explique de verdad— para que un rediseño posterior no
 * lo devuelva a ser un adorno.
 */
describe('FinancePlanView — la cabecera de salud responde al dedo', () => {
  it('la cabecera es un botón, no un adorno', () => {
    render(<FinancePlanView initialData={payload()} />);
    const boton = screen.getByRole('button', { name: /salud financiera:.*ver c[oó]mo se calcula/i });
    expect(boton).toBeInTheDocument();
    // La nota va dentro del propio blanco del dedo, no al lado.
    expect(boton).toHaveTextContent('100');
  });

  it('al tocarla se abre el desglose, con el periodo y las tres partes', () => {
    render(<FinancePlanView initialData={payload()} />);
    expect(screen.queryByText('solo el mes en curso')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /salud financiera:/i }));

    expect(screen.getByText('De dónde sale tu 100 de 100')).toBeInTheDocument();
    expect(screen.getByText('solo el mes en curso')).toBeInTheDocument();
    expect(screen.getByText('Lo que te queda libre')).toBeInTheDocument();
    expect(screen.getByText('Ir al día con lo vencido')).toBeInTheDocument();
    expect(screen.getByText('Metas que llegan a tiempo')).toBeInTheDocument();
  });

  it('y se cierra sin dejar la pantalla bloqueada', () => {
    render(<FinancePlanView initialData={payload()} />);
    fireEvent.click(screen.getByRole('button', { name: /salud financiera:/i }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]);

    expect(screen.queryByText('solo el mes en curso')).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
