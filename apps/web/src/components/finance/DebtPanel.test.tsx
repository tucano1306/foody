import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardStatementInfo, CreditForPlan, DebtWithProjection } from '@/lib/debt-data';
import { projectDebt, type RatePeriod } from '@/lib/debt-engine';
import type { DebtOverview } from '@/lib/finance-engine';
import DebtPanel from './DebtPanel';

/**
 * «En Deudas todo se ve bien, pero en el Plan financiero no»: el plan listaba
 * los tres saldos de la 3650 como tres deudas sueltas, sin el mínimo del
 * estado ni el aviso del 0 % que se acaba. Aquí se prueba que el plan pinta
 * la tarjeta como Deudas y abre los mismos modales.
 */

const GRUPO = '339896bb-13c0-4337-aed2-914c7c099954';

function credito(over: Partial<CreditForPlan> & Pick<CreditForPlan, 'id' | 'name' | 'balance'>): CreditForPlan {
  return {
    installment: 0,
    monthlyInterest: 0,
    monthsToPayoff: null,
    neverPaysOff: false,
    businessShare: 0,
    linkedPaymentId: null,
    duplicateDismissed: false,
    issuer: 'Bank of America',
    cardGroup: GRUPO,
    accountLast4: '3650',
    currency: 'USD',
    rate: 23.99,
    ratePeriod: 'annual_nominal',
    promoEndsOn: null,
    rateAfterPromo: null,
    promoKind: 'cero' as const,
    deferredInterest: null,
    openedAt: null,
    ...over,
  };
}

const credits: CreditForPlan[] = [
  credito({ id: 'compras', name: 'Compras 3650', balance: 1177.04, installment: 158, monthlyInterest: 23.53 }),
  credito({ id: 'unlimited', name: 'Unlimited Cash 3650', balance: 11286, installment: 3762, rate: 0, promoEndsOn: '2027-01-25', rateAfterPromo: 23.99 }),
  credito({ id: 'saldo-nuevo', name: 'Saldo nuevo 3650', balance: 553.4, installment: 16.6, monthlyInterest: 11.06 }),
  credito({ id: '6791', name: 'Adelanto 0 % 6791', balance: 6052, installment: 550, cardGroup: null, accountLast4: '6791', rate: 0, promoEndsOn: '2027-09-27', rateAfterPromo: 27.49 }),
];

function overview(): DebtOverview {
  const creditOrder = [...credits]
    .sort((a, b) => b.monthlyInterest - a.monthlyInterest || b.balance - a.balance)
    .map((c) => ({
      id: c.id,
      name: c.name,
      balance: c.balance,
      installment: c.installment,
      monthlyInterest: c.monthlyInterest,
      monthsToPayoff: c.monthsToPayoff,
      neverPaysOff: c.neverPaysOff,
      countedInPayments: false,
    }));
  return {
    overdueTotal: 0,
    overdueCount: 0,
    payoffOrder: [],
    monthlyCatchUp: 0,
    monthsToClear: null,
    goalDebtTotal: 0,
    creditBalance: 19068.44,
    creditMonthlyInterest: 34.59,
    creditPayments: 4486.6,
    creditOrder,
    creditsStuck: [],
  };
}

const estado: CardStatementInfo = {
  cardGroup: GRUPO,
  closingDate: '2026-10-25',
  minimumDue: 154,
  dueDate: '2026-11-22',
  newBalance: 13170.44,
  paidSinceClosing: 154,
};

function tramo(
  id: string,
  name: string,
  balance: number,
  rate: number,
  extra: Partial<DebtWithProjection> = {},
): DebtWithProjection {
  const base = {
    id,
    userId: 'user-1',
    name,
    kind: 'credit_card' as const,
    issuer: 'Bank of America',
    accountLast4: null,
    currency: 'USD',
    originalAmount: balance,
    currentBalance: balance,
    rate,
    ratePeriod: 'annual_nominal' as RatePeriod,
    strategy: 'minimum' as const,
    termMonths: null,
    payoffDate: null,
    customPayment: null,
    minPercent: 1,
    minFloor: 35,
    minIncludesInterest: true,
    extraMonthly: 0,
    businessShare: 0,
    linkedPaymentId: null,
    duplicateDismissed: false,
    promoEndsOn: null,
    rateAfterPromo: null,
    cardGroup: GRUPO,
    cycleDays: 31,
    statementDay: 25,
    creditLimit: null,
    dueDay: 22,
    openedAt: '2026-08-01',
    lastAccrualAt: '2026-09-25',
    promoKind: 'cero' as const,
    deferredInterest: null,
    status: 'active' as const,
    note: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    ...extra,
  };
  return {
    ...base,
    projection: projectDebt({ balance, rate, ratePeriod: base.ratePeriod, strategy: 'minimum', minPercent: 1, minFloor: 35 }),
    breakdown: {
      principalOwed: balance,
      interestOwed: 0,
      feesOwed: 0,
      totalPaid: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      progress: 0,
    },
    advice: [],
    daysUntilDue: 20,
    isOverdue: false,
    utilization: null,
  };
}

beforeAll(async () => {
  // Los modales se cargan con next/dynamic: precargados, el import se
  // resuelve al momento y el test no depende de lo rápido que transforme.
  await import('@/components/debts/CardPaymentModal');
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('el Plan pinta las tarjetas como Deudas', () => {
  it('los tres saldos de la 3650 van juntos, con su total, el mínimo del estado y el aviso del 0 %', () => {
    render(<DebtPanel debts={overview()} credits={credits} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);

    expect(screen.getByText('Bank of America ···3650')).toBeInTheDocument();
    const saldos = within(screen.getByRole('list', { name: 'Saldos de Bank of America ···3650' }));
    expect(saldos.getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Unlimited Cash 3650'),
      expect.stringContaining('Compras 3650'),
      expect.stringContaining('Saldo nuevo 3650'),
    ]);
    // El total con centavos, como en Deudas.
    expect(screen.getByText('$13,016.44')).toBeInTheDocument();
    expect(screen.getByText('Mínimo del estado · vence el 22 nov 2026')).toBeInTheDocument();
    expect(screen.getByText('✓ Cubierto')).toBeInTheDocument();
    expect(saldos.getByText(/El 0 % se acaba en 86 días/)).toBeInTheDocument();
  });

  it('una tarjeta de un solo saldo va suelta y fuera del grupo', () => {
    render(<DebtPanel debts={overview()} credits={credits} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);
    const grupo = within(screen.getByRole('list', { name: 'Saldos de Bank of America ···3650' }));
    expect(grupo.queryByText('Adelanto 0 % 6791')).toBeNull();
    expect(screen.getByText('Adelanto 0 % 6791')).toBeInTheDocument();
  });

  it('sin el detalle del servidor, cada crédito se pinta suelto: nada desaparece', () => {
    render(<DebtPanel debts={overview()} onChanged={vi.fn()} />);
    expect(screen.queryByText('Bank of America ···3650')).toBeNull();
    for (const c of credits) expect(screen.getByText(c.name)).toBeInTheDocument();
  });

  it('«Abonar a la tarjeta» trae sus tramos y abre el mismo modal que en Deudas', async () => {
    const tramos = [
      tramo('compras', 'Compras 3650', 1177.04, 23.99, { cardGroup: GRUPO, accountLast4: '3650' }),
      tramo('unlimited', 'Unlimited Cash 3650', 11286, 0, { cardGroup: GRUPO, accountLast4: '3650', promoEndsOn: '2027-01-25', rateAfterPromo: 23.99 }),
      tramo('otra', 'Otra tarjeta', 500, 20, { cardGroup: null }),
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ debts: tramos, portfolio: {}, cardStatements: { [GRUPO]: estado } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<DebtPanel debts={overview()} credits={credits} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '💸 Abonar a la tarjeta' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/debts', expect.anything()));
    const dialogo = await screen.findByText('Abonar a la tarjeta', {}, { timeout: 3000 });
    expect(dialogo).toBeInTheDocument();
    // Solo los tramos de ESTA tarjeta: «Otra tarjeta» no entra en el reparto.
    expect(screen.getByText(/Bank of America ···3650 · debes \$12,463\.04/)).toBeInTheDocument();
  });
});
