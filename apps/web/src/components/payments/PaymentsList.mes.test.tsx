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
 * Un seguro de $515 cada seis meses (octubre y abril). No es un pago mensual:
 * primero se sumaba a los pagos de CADA mes, y contarlo en su mes tampoco era
 * lo pedido —ese mes saltaba $515—. Va aparte, en «Cada varios meses», y entra
 * en la agenda un mes antes de vencer.
 */
describe('PaymentsList — recibos que no son mensuales', () => {
  const seguro = (over: Partial<MonthlyPayment> = {}) =>
    payment({
      id: 'geico', name: 'Geico', amount: 515, frequency: 'semiannual', anchorMonth: 10,
      isPaidThisMonth: true, daysUntilDue: 145, ...over,
    } as Partial<MonthlyPayment>);
  const renta = payment({ id: 'renta', name: 'Renta', amount: 1000, daysUntilDue: 10 });

  afterEach(() => vi.useRealTimers());

  it('fuera de su mes no suma nada y sale en «Cada varios meses»', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12)); // 20 de noviembre

    render(<PaymentsList initialPayments={[seguro(), renta]} />);

    expect(tablero()).toHaveTextContent('de $1,000.00');
    expect(within(tablero()).getByRole('button', { name: /Pagados/ })).toHaveTextContent('0 pagos');
    const aparte = screen.getByRole('heading', { name: 'Cada varios meses' }).closest('section')!;
    expect(within(aparte).getAllByText('Geico').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Pagados este mes' })).toBeNull();
  });

  it('ni siquiera en su mes entra en los pagos mensuales', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12)); // 20 de octubre

    const conRegistro = seguro({
      currentRecord: { status: 'paid', amount: 515, actualAmount: null } as MonthlyPayment['currentRecord'],
    });
    render(<PaymentsList initialPayments={[conRegistro, renta]} />);

    expect(tablero()).toHaveTextContent('de $1,000.00');
    expect(screen.getByRole('heading', { name: 'Cada varios meses' })).toBeInTheDocument();
  });

  it('un mes antes de vencer aparece en la agenda con su importe', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 2, 20, 12)); // 20 de marzo de 2027; vence el 19 de abril

    render(<PaymentsList initialPayments={[seguro({ daysUntilDue: 30 }), renta]} />);

    const t = within(tablero());
    expect(t.getByText('Se acercan · cada varios meses')).toBeInTheDocument();
    expect(t.getByRole('button', { name: /Geico/ })).toHaveTextContent('$515.00');
    // Y el total del mes sigue sin él.
    expect(tablero()).toHaveTextContent('de $1,000.00');
  });

  it('las pestañas Todo / Personal / Negocio cuentan solo los mensuales', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12)); // octubre, el mes del seguro

    const local = payment({ id: 'local', name: 'Local', amount: 1500, businessShare: 100, daysUntilDue: 5 });
    render(<PaymentsList initialPayments={[seguro(), renta, local]} />);

    // Personal: solo la renta. Antes sumaba también los 515 del seguro.
    expect(screen.getByRole('button', { name: /Personal/ })).toHaveTextContent('$1,000.00');
    expect(screen.getByRole('button', { name: /Todo/ })).toHaveTextContent('$2,500.00');
  });
});
