import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Un seguro de $515 cada seis meses (octubre y abril). En los meses en que no
 * vence el servidor lo da por «al día», y la pantalla lo sumaba como pagado:
 * los pagos de CADA mes salían $515 más altos.
 */
describe('PaymentsList — recibos que no son mensuales', () => {
  const seguro = (over: Partial<MonthlyPayment> = {}) =>
    payment({
      id: 'geico', name: 'Geico', amount: 515, frequency: 'semiannual', anchorMonth: 10,
      isPaidThisMonth: true, daysUntilDue: 145, ...over,
    } as Partial<MonthlyPayment>);
  const renta = payment({ id: 'renta', name: 'Renta', amount: 1000, daysUntilDue: 10 });

  afterEach(() => vi.useRealTimers());

  it('en un mes que no le toca, no suma nada y sale aparte', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12)); // 20 de noviembre

    render(<PaymentsList initialPayments={[seguro(), renta]} />);

    expect(tablero()).toHaveTextContent('de $1,000.00');
    expect(within(tablero()).getByRole('button', { name: /Pagados/ })).toHaveTextContent('0 pagos');
    const aparte = screen.getByRole('heading', { name: 'No vencen este mes' }).closest('section')!;
    expect(within(aparte).getAllByText('Geico').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Pagados este mes' })).toBeNull();
  });

  it('en su mes, pagado, cuenta lo que de verdad se cobró', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12)); // 20 de octubre

    const conRegistro = seguro({
      currentRecord: { status: 'paid', amount: 87.17, actualAmount: null } as MonthlyPayment['currentRecord'],
    });
    render(<PaymentsList initialPayments={[conRegistro, renta]} />);

    // 87.17 cobrados + 1000 pendientes; nunca los 515 de la ficha.
    expect(tablero()).toHaveTextContent('$87.17');
    expect(tablero()).toHaveTextContent('de $1,087.17');
    expect(screen.queryByRole('heading', { name: 'No vencen este mes' })).toBeNull();
  });

  it('las pestañas Todo / Personal / Negocio cuentan lo de este mes, no la ficha', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12)); // 20 de noviembre

    const local = payment({ id: 'local', name: 'Local', amount: 1500, businessShare: 100, daysUntilDue: 5 });
    render(<PaymentsList initialPayments={[seguro(), renta, local]} />);

    // Personal: solo la renta. Antes sumaba también los 515 del seguro.
    expect(screen.getByRole('button', { name: /Personal/ })).toHaveTextContent('$1,000.00');
    expect(screen.getByRole('button', { name: /Todo/ })).toHaveTextContent('$2,500.00');
  });
});
