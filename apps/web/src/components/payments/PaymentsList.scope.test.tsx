import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MonthlyPayment } from '@foody/types';
import PaymentsList from './PaymentsList';

/** La URL que ve el componente en cada prueba. */
let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => params,
}));

function payment(over: Partial<MonthlyPayment> = {}): MonthlyPayment {
  return {
    id: 'p1',
    name: 'Renta',
    amount: 1000,
    dueDay: 3,
    category: 'rent',
    currency: 'USD',
    isActive: true,
    isPaidThisMonth: false,
    businessShare: 0,
    ...over,
  } as MonthlyPayment;
}

const PAGOS = [
  payment({ id: 'p1', name: 'Renta', amount: 2000, businessShare: 0 }),
  payment({ id: 'p2', name: 'Local', amount: 1500, businessShare: 100 }),
];

/** El botón de ámbito que está seleccionado ahora mismo. */
function ambitoActivo(): string {
  const activo = screen
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-pressed') === 'true' && /Todo|Personal|Negocio/.test(b.textContent ?? ''));
  return activo?.textContent ?? '';
}

afterEach(() => {
  params = new URLSearchParams();
});

/**
 * El consejero decía «tus pagos fijos se llevan $2.027» —solo la parte
 * personal— y su enlace abría esta pantalla en «Todo» ($4.341, con el negocio
 * dentro). El consejo y la pantalla a la que llevaba no hablaban del mismo
 * dinero, y parecía que la app metía el negocio en el plan personal.
 */
describe('PaymentsList — el ámbito viene en la URL', () => {
  it('sin parámetro abre en «Todo», como siempre', () => {
    render(<PaymentsList initialPayments={PAGOS} />);
    expect(ambitoActivo()).toContain('Todo');
  });

  it('con ?scope=personal abre en «Personal»', () => {
    params = new URLSearchParams('scope=personal');
    render(<PaymentsList initialPayments={PAGOS} />);
    expect(ambitoActivo()).toContain('Personal');
  });

  it('con ?scope=business abre en «Negocio»', () => {
    params = new URLSearchParams('scope=business');
    render(<PaymentsList initialPayments={PAGOS} />);
    expect(ambitoActivo()).toContain('Negocio');
  });

  it('un ámbito que no existe no rompe nada: se abre en «Todo»', () => {
    params = new URLSearchParams('scope=loquesea');
    render(<PaymentsList initialPayments={PAGOS} />);
    expect(ambitoActivo()).toContain('Todo');
  });

  it('en «Personal» el total deja fuera el pago del negocio', () => {
    params = new URLSearchParams('scope=personal');
    render(<PaymentsList initialPayments={PAGOS} />);
    // $2.000 personales, no los $3.500 de los dos juntos.
    expect(screen.getAllByText('$2,000.00').length).toBeGreaterThan(0);
  });
})
