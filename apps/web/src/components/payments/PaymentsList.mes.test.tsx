import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MonthlyPayment } from '@foody/types';
import PaymentsList from './PaymentsList';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function payment(over: Partial<MonthlyPayment>): MonthlyPayment {
  return {
    id: 'p',
    name: 'Pago',
    amount: 100,
    dueDay: 3,
    category: 'other',
    currency: 'USD',
    isActive: true,
    isPaidThisMonth: false,
    daysUntilDue: 10,
    snoozedUntil: null,
    businessShare: 0,
    ...over,
  } as MonthlyPayment;
}

const PAGOS = [
  payment({ id: 'renta', name: 'Renta', amount: 2000, isPaidThisMonth: true, daysUntilDue: 30 }),
  payment({ id: 'gmc', name: 'GMC', amount: 1097, daysUntilDue: 1 }),
  payment({ id: 'permiso', name: 'Permiso', amount: 600, daysUntilDue: -12 }),
  payment({ id: 'luz', name: 'Luz', amount: 80, daysUntilDue: 20 }),
];

const tablero = () => screen.getByRole('region', { name: /Pagos de/ });

/**
 * Las tres tarjetas de antes decían cuánto pero no cuándo. El tablero dice lo
 * pagado contra el total, y pone en orden lo vencido y lo que sale esta semana.
 */
describe('PaymentsList — el mes de pagos', () => {
  it('lo pagado contra el total del mes', () => {
    render(<PaymentsList initialPayments={PAGOS} />);
    expect(tablero()).toHaveTextContent('$2,000.00');
    expect(tablero()).toHaveTextContent('de $3,777.00');
    const porPagar = within(tablero()).getByRole('button', { name: /Por pagar/ });
    expect(porPagar).toHaveTextContent('$1,777.00');
    expect(porPagar).toHaveTextContent('3 pagos');
  });

  it('la agenda separa lo vencido de lo que vence esta semana', () => {
    render(<PaymentsList initialPayments={PAGOS} />);
    const t = within(tablero());
    expect(t.getByText('Vencido')).toBeInTheDocument();
    expect(t.getByText('venció hace 12 días')).toBeInTheDocument();
    expect(t.getByText('Próximos 7 días')).toBeInTheDocument();
    expect(t.getByText('vence mañana')).toBeInTheDocument();
    // La luz vence en 20 días: no es de esta semana.
    expect(t.queryByText('Luz')).toBeNull();
  });

  it('tocar un pago de la agenda lo abre', () => {
    render(<PaymentsList initialPayments={PAGOS} />);
    fireEvent.click(within(tablero()).getByRole('button', { name: /GMC/ }));
    expect(push).toHaveBeenCalledWith('/payments?payment=gmc', { scroll: false });
  });

  it('los chips filtran la lista, y tocar otra vez lo quita', () => {
    render(<PaymentsList initialPayments={PAGOS} />);
    const pagados = within(tablero()).getByRole('button', { name: /Pagados/ });

    fireEvent.click(pagados);
    expect(pagados).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('heading', { name: 'Pendientes' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Pagados este mes' })).toBeInTheDocument();

    fireEvent.click(pagados);
    expect(screen.getByRole('heading', { name: 'Pendientes' })).toBeInTheDocument();
  });
});
