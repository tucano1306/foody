import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection } from '@/lib/debt-data';
import { projectDebt } from '@/lib/debt-engine';
import DebtEditModal from './DebtEditModal';

/**
 * Cifras inventadas: una tarjeta al 0 % que vence el 22 y tiene que quedar en
 * cero el 25 de enero, vista el 23 de noviembre. El 22 de noviembre ya pasó:
 * quedan los vencimientos del 22 de diciembre y del 22 de enero.
 */
const HOY = new Date(2026, 10, 23, 12);

function tarjeta(): DebtWithProjection {
  const base = {
    id: 'debt-1',
    userId: 'user-1',
    name: 'Tarjeta al 0 %',
    kind: 'credit_card' as const,
    issuer: null,
    accountLast4: null,
    currency: 'USD',
    originalAmount: 9000,
    currentBalance: 9000,
    rate: 0,
    ratePeriod: 'annual_nominal' as const,
    strategy: 'by_date' as const,
    termMonths: null,
    payoffDate: '2027-01-25',
    customPayment: null,
    minPercent: null,
    minFloor: null,
    minIncludesInterest: false,
    extraMonthly: 0,
    businessShare: 0,
    linkedPaymentId: null,
    duplicateDismissed: false,
    promoEndsOn: '2027-01-25',
    rateAfterPromo: 24,
    promoKind: 'cero' as const,
    deferredInterest: null,
    cardGroup: null,
    cycleDays: null,
    statementDay: null,
    creditLimit: null,
    dueDay: 22,
    openedAt: '2026-06-01',
    lastAccrualAt: '2026-06-01',
    status: 'active' as const,
    note: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
  return {
    ...base,
    projection: projectDebt({
      balance: base.currentBalance,
      rate: base.rate,
      ratePeriod: base.ratePeriod,
      strategy: base.strategy,
      payoffDate: base.payoffDate,
      promoEndsOn: base.promoEndsOn,
      rateAfterPromo: base.rateAfterPromo,
      dueDay: base.dueDay,
      now: HOY,
    }),
    breakdown: {
      principalOwed: 9000,
      interestOwed: 0,
      feesOwed: 0,
      totalPaid: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      progress: 0,
    },
    advice: [],
    daysUntilDue: 29,
    isOverdue: false,
    utilization: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: HOY, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * «Quedan 3 meses» contaba el calendario: del 23 al 25 de noviembre salía una
 * cuota de más que la que reparte la estrategia, y la hoja decía un número y
 * la cuota se calculaba con otro.
 */
describe('DebtEditModal — «antes de una fecha» cuenta los vencimientos', () => {
  it('dice las cuotas que caben con su día de pago, no los meses del calendario', () => {
    render(<DebtEditModal debt={tarjeta()} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(/Quedan 2 cuotas/)).toBeInTheDocument();
  });

  it('cambiar el día de pago cambia la cuenta', () => {
    render(<DebtEditModal debt={tarjeta()} onClose={() => {}} onSaved={() => {}} />);
    // El 24 todavía no ha pasado: entran 24 nov, 24 dic y 24 ene.
    fireEvent.change(screen.getByLabelText('Día de pago del mes'), { target: { value: '24' } });
    expect(screen.getByText(/Quedan 3 cuotas/)).toBeInTheDocument();
  });

  it('la deuda proyectada reparte entre esas mismas cuotas', () => {
    expect(tarjeta().projection.installment).toBe(4500);
  });
});
