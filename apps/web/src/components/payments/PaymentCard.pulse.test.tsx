import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MonthlyPayment } from '@foody/types';
import PaymentCard from './PaymentCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * El aviso que respira (`.pulse-pending`, globals.css).
 *
 * Una tarjeta sin pagar late muy despacio hacia un rojo crema y vuelve, porque
 * un color fijo se vuelve invisible a los dos dias. Es una funcion PURAMENTE
 * visual: no rompe ninguna prueba al desaparecer, no da error en consola y
 * nadie la echa de menos hasta que un dia se pregunta «¿eso sigue ahi?».
 * Vivio un año sin una sola prueba. Esta es esa prueba.
 */
function pago(over: Partial<MonthlyPayment> = {}): MonthlyPayment {
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
    daysUntilDue: 2,
    ...over,
  } as MonthlyPayment;
}

/** La tarjeta es el botón que abre el detalle. */
function tarjeta(over: Partial<MonthlyPayment> = {}): HTMLElement {
  const noop = () => {};
  render(<PaymentCard payment={pago(over)} onDeleted={noop} onUpdated={noop} onSnoozed={noop} />);
  return screen.getByRole('button', { name: /Renta/ });
}

describe('PaymentCard — el aviso que respira', () => {
  it('un pago sin pagar late', () => {
    expect(tarjeta()).toHaveClass('pulse-pending');
  });

  it('un pago ya pagado NO late: el aviso deja de tener sentido', () => {
    expect(tarjeta({ isPaidThisMonth: true })).not.toHaveClass('pulse-pending');
  });

  it('un pago pospuesto tampoco: el usuario ya dijo «más tarde»', () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString();
    expect(tarjeta({ snoozedUntil: manana })).not.toHaveClass('pulse-pending');
  });

  it('si el aplazamiento ya venció, vuelve a latir', () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString();
    expect(tarjeta({ snoozedUntil: ayer })).toHaveClass('pulse-pending');
  });

  // Lo que enciende el aviso es que siga sin pagarse, no la urgencia: un pago
  // vencido hace nueve dias y otro que vence dentro de veinticinco laten igual.
  it('late un pago ya vencido', () => {
    expect(tarjeta({ daysUntilDue: -9 })).toHaveClass('pulse-pending');
  });

  it('late tambien uno que aun no vence', () => {
    expect(tarjeta({ daysUntilDue: 25 })).toHaveClass('pulse-pending');
  });
});
