import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection } from '@/lib/debt-data';
import { projectDebt, type RatePeriod } from '@/lib/debt-engine';
import CardStatementModal from './CardStatementModal';

/**
 * «El botón cuadrar la tarjeta no hace nada»: sí hacía — rechazaba el cuadre —,
 * pero el porqué salía arriba del formulario, fuera de la vista de quien acaba
 * de bajar hasta el botón. Aquí se prueba que el porqué se ve junto al botón,
 * que un saldo nuevo no necesita nombre y que el vencimiento propuesto es el
 * del estado aunque un tramo lo tenga mal apuntado.
 */

const GRUPO = '11111111-1111-4111-8111-111111111111';

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
    promoKind: 'cero' as const,
    deferredInterest: null,
    cardGroup: GRUPO,
    cycleDays: 31,
    statementDay: 25,
    creditLimit: null,
    dueDay: 22,
    openedAt: '2026-08-01',
    lastAccrualAt: '2026-09-25',
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

// Como la tarjeta real: el de compras vence los 22 y el de la promoción tiene
// apuntado el 25, que no es el del estado.
const compras = tramo('compras', 'Compras 3650', 1177.04, 23.99);
const promo = tramo('promo', 'Unlimited Cash 3650', 11440, 0, {
  promoEndsOn: '2027-01-25',
  rateAfterPromo: 23.99,
  dueDay: 25,
});

function respuestas(post: Response) {
  return vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(init?.method === 'POST' ? post : new Response(JSON.stringify({ movido: {} }), { status: 200 })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
  // jsdom no implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('cuadrar la tarjeta', () => {
  it('propone el cierre y el vencimiento del estado, no el del primer tramo', () => {
    vi.stubGlobal('fetch', respuestas(new Response('{}')));
    render(<CardStatementModal tramos={[promo, compras]} estado={null} onClose={() => {}} onSaved={() => {}} />);
    const [cierre, vence] = screen.getAllByDisplayValue(/^2026-1\d-\d\d$/) as HTMLInputElement[];
    expect(cierre.value).toBe('2026-10-25');
    expect(vence.value).toBe('2026-11-22');
  });

  it('sin el mínimo, el aviso sale junto al botón y lleva al campo', async () => {
    const fetchMock = respuestas(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    render(<CardStatementModal tramos={[promo, compras]} estado={null} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cuadrar la tarjeta' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Copia el pago mínimo');
    const minimo = screen.getByLabelText('Pago mínimo del estado de cuenta');
    expect(document.activeElement).toBe(minimo);
    expect(minimo.scrollIntoView).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('un saldo nuevo sin nombre se manda igual y cuadra', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const fetchMock = respuestas(new Response(JSON.stringify({ debts: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CardStatementModal tramos={[promo, compras]} estado={null} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Pago mínimo del estado de cuenta'), { target: { value: '154' } });
    fireEvent.click(screen.getByRole('button', { name: /Un saldo del estado que no está aquí/ }));
    // El hueco del nombre enseña el que tendrá.
    expect(screen.getByLabelText('Nombre del saldo nuevo')).toHaveAttribute('placeholder', 'Saldo nuevo 3650');
    fireEvent.change(screen.getByLabelText('Saldo del saldo nuevo'), { target: { value: '553.40' } });
    fireEvent.change(screen.getByLabelText('Tasa anual del saldo nuevo'), { target: { value: '23.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cuadrar la tarjeta' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST') as [string, RequestInit];
    expect(post[0]).toBe(`/api/debts/cards/${GRUPO}/statement`);
    expect(JSON.parse(String(post[1].body))).toMatchObject({
      closingDate: '2026-10-25',
      minimumDue: 154,
      dueDate: '2026-11-22',
      nuevos: [{ name: '', balance: 553.4, apr: 23.99, promoEndsOn: null }],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('si el servidor rechaza el cuadre, el porqué sale junto al botón', async () => {
    vi.stubGlobal(
      'fetch',
      respuestas(new Response(JSON.stringify({ message: 'El saldo nuevo tiene que ser mayor que 0' }), { status: 422 })),
    );
    render(<CardStatementModal tramos={[promo, compras]} estado={null} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.change(screen.getByLabelText('Pago mínimo del estado de cuenta'), { target: { value: '154' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cuadrar la tarjeta' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('El saldo nuevo tiene que ser mayor que 0'));
    // Junto al botón: en el mismo pie, no arriba del formulario.
    const boton = screen.getByRole('button', { name: 'Cuadrar la tarjeta' });
    expect(screen.getByRole('alert').parentElement?.contains(boton)).toBe(true);
  });
});
