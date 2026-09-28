import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, projectDebt, type RatePeriod } from '@/lib/debt-engine';
import DebtsView from './DebtsView';

/**
 * «Cada vez que pago el mínimo no sé dónde registrarlo… no sé a cuánto
 * colocarle a los 11.440 o al otro monto». La 3650 son tres saldos con un solo
 * mínimo; aquí se prueba que la app los junta y reparte el abono a la vista.
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

const compras = tramo('compras', 'Compras 3650', 1164.26, 23.74);
const promoOct = tramo('promo-oct', 'Adelanto oct 3650', 699, 0, { promoEndsOn: '2099-10-25', rateAfterPromo: 23.74 });
const promoEne = tramo('promo-ene', 'Adelanto ene 3650', 11440, 0, { promoEndsOn: '2099-12-25', rateAfterPromo: 23.74 });

function snapshot(debts: DebtWithProjection[]): DebtsSnapshot {
  return { debts, portfolio: buildPortfolio([]) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('los tramos de una tarjeta van juntos', () => {
  it('tres tramos con la misma tarjeta se pintan como una sola, con su total', () => {
    render(<DebtsView initial={snapshot([promoEne, compras, promoOct])} />);
    const tarjeta = within(screen.getByText('Bank of America ···3650').closest('div.rounded-3xl') as HTMLElement);
    expect(tarjeta.getByText('$13,303.26')).toBeInTheDocument();
    expect(tarjeta.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /Abonar a la tarjeta/ })).toHaveLength(1);
  });

  it('cada tramo dice su tasa: 0 % hasta su fecha, o la que cobra', () => {
    render(<DebtsView initial={snapshot([promoEne, compras, promoOct])} />);
    expect(screen.getByText('0 % hasta el 25 oct 2099')).toBeInTheDocument();
    expect(screen.getByText('23.74 % anual')).toBeInTheDocument();
  });

  it('una deuda con tarjeta pero sin más tramos se pinta suelta', () => {
    render(<DebtsView initial={snapshot([compras])} />);
    expect(screen.queryByRole('button', { name: /Abonar a la tarjeta/ })).toBeNull();
  });
});

describe('abonar a la tarjeta', () => {
  async function abrir() {
    render(<DebtsView initial={snapshot([promoEne, compras, promoOct])} />);
    fireEvent.click(screen.getByRole('button', { name: /Abonar a la tarjeta/ }));
    await screen.findByRole('heading', { name: 'Abonar a la tarjeta' });
    const monto = screen.getByLabelText('Monto a abonar');
    const minimo = screen.getByLabelText('Pago mínimo del estado de cuenta');
    return { monto, minimo };
  }

  it('el mínimo de $156 va al adelanto que caduca antes, y avisa de que compras no baja', async () => {
    const { monto, minimo } = await abrir();
    fireEvent.change(minimo, { target: { value: '156' } });
    fireEvent.change(monto, { target: { value: '156' } });

    const reparto = within(screen.getByRole('list', { name: 'Reparto del abono' }));
    expect(reparto.getAllByRole('listitem')).toHaveLength(1);
    expect(reparto.getByText('Adelanto oct 3650')).toBeInTheDocument();
    expect(reparto.getByText('quedan $543.00')).toBeInTheDocument();
    expect(screen.getByText(/Compras 3650 \(23\.74 %\) no baja/)).toBeInTheDocument();
  });

  it('lo que pasa del mínimo se ve yendo a compras al 23.74 %', async () => {
    const { monto, minimo } = await abrir();
    fireEvent.change(minimo, { target: { value: '156' } });
    fireEvent.change(monto, { target: { value: '500' } });

    const reparto = within(screen.getByRole('list', { name: 'Reparto del abono' }));
    expect(reparto.getByText('➕ $344.00 de más')).toBeInTheDocument();
    expect(reparto.getByText('quedan $820.26')).toBeInTheDocument();
    expect(screen.queryByText(/no baja/)).toBeNull();
  });

  it('manda a la tarjeta el monto y el mínimo, no un reparto hecho en el cliente', async () => {
    const actualizadas = [{ ...promoOct, currentBalance: 543 }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allocation: {}, debts: actualizadas }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { monto, minimo } = await abrir();
    fireEvent.change(minimo, { target: { value: '156' } });
    fireEvent.change(monto, { target: { value: '156' } });
    fireEvent.click(screen.getByRole('button', { name: 'Abonar $156.00' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/debts/cards/${GRUPO}/payments`);
    expect(JSON.parse(String(init.body))).toEqual({ amount: 156, minimumDue: 156, paymentMethod: null });
    // La tarjeta de la lista ya enseña lo que asentó el servidor.
    await waitFor(() => expect(screen.getByText('$543.00')).toBeInTheDocument());
  });
});
