import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection, CreditForPlan } from '@/lib/debt-data';
import type { FinancePlanPayload } from '@/lib/finance-data';
import { buildFinancePlan, goalWithDebt, type FinanceGoal, type PlanInput } from '@/lib/finance-engine';
import { buildPortfolio, projectDebt, type RatePeriod } from '@/lib/debt-engine';
import { EMPTY_GROCERY_INSIGHT } from '@/lib/grocery-insights';
import { EMPTY_OTHER_SPEND } from '@/lib/other-spend';
import FinancePlanView from './FinancePlanView';

/**
 * «Cuando haga un abono en cualquier tarjeta que esté en Deudas y en Metas,
 * se debe reflejar en ambas secciones.»
 *
 * Deudas → Metas ya iba: la meta enganchada lee el saldo de la deuda. Lo que
 * fallaba era al revés: «Abonar la tarjeta» en la meta abría el aporte de la
 * meta, que se pisaba en la siguiente carga, y Deudas no se enteraba. Aquí se
 * prueba que ese botón abona en Deudas, con el modal de Deudas.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// El festejo del abono usa audio y canvas, que jsdom no tiene.
vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));
vi.mock('@/lib/fx', () => ({ confettiRain: vi.fn(), burstAt: vi.fn() }));

const GRUPO = '44444444-4444-4444-8444-444444444444';
const COMPRAS = 'c0000000-0000-4000-8000-000000000001';
const ADELANTO = 'c0000000-0000-4000-8000-000000000002';
const SUELTA = 'c0000000-0000-4000-8000-000000000003';

function deuda(id: string, name: string, balance: number, extra: Partial<DebtWithProjection> = {}): DebtWithProjection {
  const base = {
    id, userId: 'user-1', name, kind: 'credit_card' as const, issuer: 'Bank of America', accountLast4: '3650',
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

const TRAMOS = [deuda(COMPRAS, 'Compras 3650', 1000), deuda(ADELANTO, 'Adelanto 3650', 500, { rate: 0 })];
const SUELTA_DEUDA = deuda(SUELTA, 'Cash Rewards 8523', 800, { cardGroup: null, accountLast4: '8523' });

function credito(d: DebtWithProjection): CreditForPlan {
  return {
    id: d.id, name: d.name, balance: d.currentBalance, installment: 50, monthlyInterest: 10, monthsToPayoff: 20,
    payoffDate: null, neverPaysOff: false, businessShare: 0, linkedPaymentId: null, duplicateDismissed: false, issuer: d.issuer,
    cardGroup: d.cardGroup, kind: d.kind, accountLast4: d.accountLast4, currency: d.currency, rate: d.rate,
    ratePeriod: d.ratePeriod, promoEndsOn: d.promoEndsOn, rateAfterPromo: d.rateAfterPromo, promoKind: d.promoKind,
    deferredInterest: d.deferredInterest, openedAt: d.openedAt,
  };
}

function meta(id: string, name: string, debtId: string | null, saldo?: number): FinanceGoal {
  const g: FinanceGoal = {
    id, name, emoji: '💳', kind: 'debt', targetAmount: 1000, savedAmount: 0, targetDate: null, priority: 2,
    monthlyOverride: null, status: 'active', note: null, createdAt: '2026-10-01T00:00:00.000Z', debtId,
  };
  return saldo === undefined ? g : goalWithDebt(g, { originalAmount: 1200, currentBalance: saldo });
}

function payload(goals: FinanceGoal[]): FinancePlanPayload {
  const credits = [...TRAMOS, SUELTA_DEUDA].map(credito);
  const input: PlanInput = {
    incomes: [{ id: 'i1', name: 'Sueldo', amount: 5000, frequency: 'monthly', isActive: true, note: null }],
    goals,
    fixedPayments: [],
    credits,
    groceriesMonthly: 400,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 100,
    now: new Date(2026, 10, 7, 12),
  };
  return {
    ...buildFinancePlan(input),
    // Recién calculada, como la manda el servidor: una foto vieja hace que la
    // pantalla se relea sola al montar (ver FinancePlanView.fresco.test.tsx).
    generatedAt: new Date().toISOString(),
    incomes: [...input.incomes],
    rawGoals: goals,
    contributions: [],
    groceries: { ...EMPTY_GROCERY_INSIGHT },
    otherSpend: { ...EMPTY_OTHER_SPEND },
    groceriesBusinessShare: 0,
    otherBusinessShare: 0,
    duplicateObligations: [],
    history: [],
    payments: [],
    credits,
  };
}

function respuesta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Responde como el servidor a lo que pide el Plan, y apunta cada llamada. */
function servidor(debts: DebtWithProjection[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/debts') return respuesta({ debts, portfolio: buildPortfolio([]), cardStatements: {}, creditTerms: {} });
    return respuesta({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const llamadasA = (f: ReturnType<typeof servidor>, trozo: string) => f.mock.calls.filter(([u]) => String(u).includes(trozo));

beforeAll(async () => {
  // Los modales van con next/dynamic: precargados, se resuelven al momento.
  await import('@/components/debts/CardPaymentModal');
  await import('@/components/debts/DebtPaymentModal');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('la sección «Tarjetas y créditos» ya no está en el Plan', () => {
  it('con tarjetas en Deudas, el Plan no pinta sus tarjetas ni su sección', () => {
    servidor([]);
    render(<FinancePlanView initialData={payload([])} />);
    expect(screen.queryByRole('heading', { name: /Tarjetas y créditos/ })).toBeNull();
    expect(screen.queryByText('Compras 3650')).toBeNull();
    expect(screen.queryByText('Cash Rewards 8523')).toBeNull();
    expect(screen.queryByRole('button', { name: /Abonar a la tarjeta/ })).toBeNull();
  });
});

describe('abonar desde una meta enganchada lo apunta en Deudas', () => {
  it('meta de un tramo: abre el abono de la TARJETA entera, como en Deudas', async () => {
    const f = servidor([...TRAMOS, SUELTA_DEUDA]);
    render(<FinancePlanView initialData={payload([meta('g1', 'Liquidar Compras', COMPRAS, 1000)])} />);

    fireEvent.click(screen.getByRole('button', { name: /Abonar la tarjeta/ }));

    expect(await screen.findByRole('heading', { name: 'Abonar a la tarjeta' }, { timeout: 3000 })).toBeInTheDocument();
    // Los dos tramos de la 3650, sin la suelta de al lado.
    expect(screen.getByText(/Bank of America ···3650 · debes \$1,500\.00/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Aportar a/ })).toBeNull();
    expect(llamadasA(f, '/contribute')).toHaveLength(0);
  });

  it('meta de una deuda suelta: abre el abono de esa deuda', async () => {
    const f = servidor([...TRAMOS, SUELTA_DEUDA]);
    render(<FinancePlanView initialData={payload([meta('g2', 'Liquidar la 8523', SUELTA, 800)])} />);

    fireEvent.click(screen.getByRole('button', { name: /Abonar la tarjeta/ }));

    expect(await screen.findByRole('heading', { name: 'Abonar' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/Cash Rewards 8523 · debes \$800\.00/)).toBeInTheDocument();
    expect(llamadasA(f, '/contribute')).toHaveLength(0);
  });

  it('al asentarse el abono, el Plan se relee: es lo que mueve la meta', async () => {
    const f = servidor([SUELTA_DEUDA]);
    f.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/debts') return respuesta({ debts: [SUELTA_DEUDA], portfolio: buildPortfolio([]) });
      if (url === `/api/debts/${SUELTA}/payments` && init?.method === 'POST') {
        return respuesta({ debt: { ...SUELTA_DEUDA, currentBalance: 700 } });
      }
      if (url === '/api/finance/plan') return respuesta(payload([meta('g2', 'Liquidar la 8523', SUELTA, 700)]));
      return respuesta({}, 404);
    });
    render(<FinancePlanView initialData={payload([meta('g2', 'Liquidar la 8523', SUELTA, 800)])} />);

    fireEvent.click(screen.getByRole('button', { name: /Abonar la tarjeta/ }));
    await screen.findByRole('heading', { name: 'Abonar' }, { timeout: 3000 });
    fireEvent.change(screen.getByLabelText('Monto a abonar'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abonar $100.00' }));

    await waitFor(() => expect(llamadasA(f, `/api/debts/${SUELTA}/payments`)).toHaveLength(1));
    await waitFor(() => expect(llamadasA(f, '/api/finance/plan')).toHaveLength(1));
    expect(llamadasA(f, '/contribute')).toHaveLength(0);
  });

  it('si la deuda ya no está en Deudas, no abre nada y relee el Plan', async () => {
    const f = servidor([]);
    render(<FinancePlanView initialData={payload([meta('g1', 'Liquidar Compras', COMPRAS, 1000)])} />);

    fireEvent.click(screen.getByRole('button', { name: /Abonar la tarjeta/ }));

    await waitFor(() => expect(llamadasA(f, '/api/finance/plan')).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: /Abonar/ })).toBeNull();
    expect(llamadasA(f, '/contribute')).toHaveLength(0);
  });

  it('una meta suelta sigue con su «Aportar» de siempre', async () => {
    const f = servidor([]);
    render(<FinancePlanView initialData={payload([meta('g3', 'Viaje', null)])} />);

    fireEvent.click(screen.getByRole('button', { name: /Aportar/ }));

    expect(await screen.findByRole('heading', { name: /Aportar a Viaje/ })).toBeInTheDocument();
    expect(llamadasA(f, '/api/debts')).toHaveLength(0);
  });
});

describe('y al revés: un abono en Deudas mueve la meta enganchada', () => {
  it('la meta del Plan lee lo abonado del saldo que deja Deudas', () => {
    const antes = payload([meta('g1', 'Liquidar Compras', COMPRAS, 1000)]).goals[0];
    const despues = payload([meta('g1', 'Liquidar Compras', COMPRAS, 850)]).goals[0];
    expect(despues.savedAmount - antes.savedAmount).toBe(150);
  });
});
