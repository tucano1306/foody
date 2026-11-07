import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection } from '@/lib/debt-data';
import { projectDebt, type RatePeriod } from '@/lib/debt-engine';
import CardGroupCard from './CardGroupCard';
import ChipDeCuenta from './ChipDeCuenta';

/**
 * «Las tarjetas se ven muy unidas, cuesta saber cuál es cuál», en Deudas:
 * los tramos de la 3650 eran cajas sueltas del mismo tono que la tarjeta, y
 * en oscuro del MISMO color exacto. Aquí se prueba la forma nueva: la tarjeta
 * con su sello arriba, y sus saldos juntos en una bandeja, sin sello propio.
 */

const GRUPO = '11111111-1111-4111-8111-111111111111';

function tramo(id: string, name: string, balance: number, extra: Partial<DebtWithProjection> = {}): DebtWithProjection {
  const base = {
    id, userId: 'u', name, kind: 'credit_card' as const, issuer: 'Bank of America', accountLast4: null,
    currency: 'USD', originalAmount: balance, currentBalance: balance, rate: 23.99,
    ratePeriod: 'annual_nominal' as RatePeriod, strategy: 'minimum' as const, termMonths: null, payoffDate: null,
    customPayment: null, minPercent: 1, minFloor: 35, minIncludesInterest: true, extraMonthly: 0, businessShare: 0,
    linkedPaymentId: null, duplicateDismissed: false, promoEndsOn: null, rateAfterPromo: null,
    promoKind: 'cero' as const, deferredInterest: null, cardGroup: GRUPO, cycleDays: 31, statementDay: 25,
    creditLimit: null, dueDay: 22, openedAt: '2026-08-01', lastAccrualAt: '2026-10-25', status: 'active' as const,
    note: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', ...extra,
  };
  return {
    ...base,
    projection: projectDebt({ balance, rate: base.rate, ratePeriod: base.ratePeriod, strategy: 'minimum', minPercent: 1, minFloor: 35 }),
    breakdown: { principalOwed: balance, interestOwed: 0, feesOwed: 0, totalPaid: 0, totalInterestPaid: 0, totalPrincipalPaid: 0, progress: 0 },
    advice: [], daysUntilDue: 15, isOverdue: false, utilization: null,
  };
}

const tramos = [
  tramo('compras', 'Compras 3650', 652.04),
  tramo('unlimited', 'Unlimited Cash 3650', 11_286, { rate: 0, promoEndsOn: '2027-01-25', rateAfterPromo: 23.99 }),
  tramo('nuevo', 'Saldo nuevo 3650', 553.4),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('la tarjeta de tramos en Deudas', () => {
  it('lleva arriba un sello con sus dígitos, sacados de los nombres si no se declararon', () => {
    const { container } = render(<CardGroupCard tramos={tramos} onOpenTramo={vi.fn()} onPay={vi.fn()} />);
    const sellos = container.querySelectorAll('[data-chip-cuenta]');
    expect(sellos).toHaveLength(1);
    expect(sellos[0]).toHaveAttribute('data-chip-cuenta', '3650');
    // Decorativo: el título ya lo dice y no se oye dos veces.
    expect(sellos[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('sus saldos van juntos en una bandeja, del mayor al menor, y ninguno lleva sello', () => {
    render(<CardGroupCard tramos={tramos} onOpenTramo={vi.fn()} onPay={vi.fn()} />);
    const bandeja = screen.getByRole('list', { name: 'Saldos de Bank of America ···3650' });
    expect(within(bandeja).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Unlimited Cash 3650'),
      expect.stringContaining('Compras 3650'),
      expect.stringContaining('Saldo nuevo 3650'),
    ]);
    expect(bandeja.querySelector('[data-chip-cuenta]')).toBeNull();
    // Cada fila dice su tasa o su 0 %, como antes.
    expect(within(bandeja).getByText('0 % hasta el 25 ene 2027')).toBeInTheDocument();
    expect(within(bandeja).getAllByText('23.99 % anual')).toHaveLength(2);
  });

  it('tocar un saldo abre ESE tramo', () => {
    const onOpenTramo = vi.fn();
    render(<CardGroupCard tramos={tramos} onOpenTramo={onOpenTramo} onPay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Compras 3650/ }));
    expect(onOpenTramo).toHaveBeenCalledWith('compras');
  });

  it('los dígitos declarados mandan sobre los del nombre', () => {
    const { container } = render(
      <CardGroupCard tramos={tramos.map((t) => ({ ...t, accountLast4: '9999' }))} onOpenTramo={vi.fn()} onPay={vi.fn()} />,
    );
    expect(container.querySelector('[data-chip-cuenta]')).toHaveAttribute('data-chip-cuenta', '9999');
  });
});

describe('el sello de cada cuenta', () => {
  it('una tarjeta es un plástico con sus cuatro dígitos', () => {
    const { container } = render(<ChipDeCuenta ultimos="8523" kind="credit_card" />);
    expect(container.querySelector('[data-chip-cuenta]')).toHaveTextContent('8523');
  });

  it('una tarjeta de tienda también es plástico', () => {
    const { container } = render(<ChipDeCuenta ultimos="1234" kind="store" />);
    expect(container.querySelector('[data-chip-cuenta]')).toHaveAttribute('data-chip-cuenta', '1234');
  });

  it('sin dígitos conocidos, el plástico lleva puntos en vez de inventarlos', () => {
    const { container } = render(<ChipDeCuenta ultimos={null} />);
    expect(container.querySelector('[data-chip-cuenta]')).toHaveTextContent('•••');
  });

  it.each([
    ['auto', '🚗'],
    ['loan', '🏦'],
    ['mortgage', '🏠'],
    ['personal', '🤝'],
    ['other', '📄'],
  ] as const)('un %s lleva su emoji y no un plástico', (kind, emoji) => {
    const { container } = render(<ChipDeCuenta ultimos={null} kind={kind} />);
    expect(container.querySelector('[data-chip-cuenta]')).toBeNull();
    expect(container).toHaveTextContent(emoji);
  });
});
