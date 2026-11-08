import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtMovement, DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, projectDebt, type RatePeriod } from '@/lib/debt-engine';
import DebtsView from './DebtsView';

/**
 * «Esta tarjeta hazla touchable por todos lados para entrar en ella, así como
 * están las otras tarjetas dentro de Deudas.»
 *
 * Una deuda suelta es un botón entero; la tarjeta de tramos solo respondía en
 * sus tramos y sus botones, y tocar la cabecera o el mínimo no hacía nada.
 * Aquí se prueba que cualquier punto de la superficie abre la tarjeta, que los
 * controles de dentro siguen haciendo lo suyo (y solo lo suyo), y lo que se ve
 * al entrar.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const GRUPO = '55555555-5555-4555-8555-555555555555';
const TITULO = 'Bank of America ···3650';

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

const compras = deuda('d0000000-0000-4000-8000-000000000001', 'Compras 3650', 1000);
const adelanto = deuda('d0000000-0000-4000-8000-000000000002', 'Adelanto 3650', 500, { rate: 0, promoEndsOn: '2099-01-25', rateAfterPromo: 23.99 });
const suelta = deuda('d0000000-0000-4000-8000-000000000003', 'Cash Rewards 8523', 800, { cardGroup: null, accountLast4: '8523' });

function snapshot(): DebtsSnapshot {
  return {
    debts: [compras, adelanto, suelta],
    portfolio: buildPortfolio([]),
    cardStatements: {
      [GRUPO]: { cardGroup: GRUPO, closingDate: '2026-10-25', minimumDue: 154, dueDate: '2026-11-22', newBalance: 1654, paidSinceClosing: 0 },
    },
  };
}

function mov(id: string, debtId: string, over: Partial<DebtMovement>): DebtMovement {
  return {
    id, debtId, kind: 'charge', amount: 10, interestPart: 0, principalPart: 0, feesPart: 0, balanceBefore: 0,
    balanceAfter: 0, paymentMethod: null, periodKey: null, note: null, occurredAt: '2026-11-01T15:00:00.000Z', ...over,
  };
}

/** Un abono de $156 a la tarjeta, asentado en dos trozos, y un consumo suelto. */
const LIBROS: Record<string, DebtMovement[]> = {
  [compras.id]: [
    mov('m1', compras.id, { kind: 'payment', amount: 100, occurredAt: '2026-11-05T15:00:00.100Z', note: 'Abono de $156.00 a la tarjeta: $100.00 del mínimo' }),
    mov('m2', compras.id, { kind: 'charge', amount: 42.5, occurredAt: '2026-11-02T15:00:00Z' }),
  ],
  [adelanto.id]: [
    mov('m3', adelanto.id, { kind: 'payment', amount: 56, occurredAt: '2026-11-05T15:00:00.300Z', note: 'Abono de $156.00 a la tarjeta: $56.00 del mínimo' }),
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const m = /^\/api\/debts\/([^/]+)\/movements/.exec(url);
    if (m) return new Response(JSON.stringify(LIBROS[m[1]] ?? []), { status: 200 });
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

/** La tarjeta de tramos de la lista: el bloque que lleva sus saldos. */
function tarjeta(): HTMLElement {
  const bandeja = screen.getByRole('list', { name: `Saldos de ${TITULO}` });
  const raiz = bandeja.closest('.rounded-3xl');
  if (!(raiz instanceof HTMLElement)) throw new Error('no está la tarjeta');
  return raiz;
}

const hojaAbierta = () => screen.queryByRole('region', { name: `Movimientos de ${TITULO}` });

describe('la tarjeta de tramos se toca por cualquier sitio', () => {
  it('la cabecera es un botón de verdad, con el total en su nombre', () => {
    render(<DebtsView initial={snapshot()} />);
    expect(screen.getByRole('button', { name: `Abrir ${TITULO} · debes $1,500.00` })).toBeInTheDocument();
  });

  it('tocar la cabecera abre la tarjeta', async () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Abrir Bank of America/ }));
    expect(await screen.findByRole('region', { name: `Movimientos de ${TITULO}` })).toBeInTheDocument();
  });

  it('tocar el mínimo del estado, que no es un botón, también', async () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(within(tarjeta()).getByText(/Mínimo del estado/));
    expect(await screen.findByRole('region', { name: `Movimientos de ${TITULO}` })).toBeInTheDocument();
  });

  it('y tocar el margen de la propia tarjeta', async () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(tarjeta());
    expect(await screen.findByRole('region', { name: `Movimientos de ${TITULO}` })).toBeInTheDocument();
  });

  it('un tramo abre SU hoja, no la de la tarjeta', async () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(within(tarjeta()).getByRole('button', { name: /Compras 3650/ }));
    expect(await screen.findByRole('heading', { name: /Compras 3650/ })).toBeInTheDocument();
    expect(hojaAbierta()).toBeNull();
  });

  it('«Abonar a la tarjeta» abre el abono y nada más', async () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(within(tarjeta()).getByRole('button', { name: /Abonar a la tarjeta/ }));
    expect(await screen.findByRole('heading', { name: 'Abonar a la tarjeta' })).toBeInTheDocument();
    expect(hojaAbierta()).toBeNull();
  });

  it('«⋯» abre su menú y nada más', () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: `Más acciones de ${TITULO}` }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(hojaAbierta()).toBeNull();
  });

  it('la deuda suelta de al lado sigue abriéndose como siempre', async () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(screen.getAllByText('Cash Rewards 8523')[0]);
    expect(await screen.findByRole('heading', { name: /Cash Rewards 8523/ })).toBeInTheDocument();
    expect(hojaAbierta()).toBeNull();
  });
});

describe('dentro de la tarjeta', () => {
  async function entrar() {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Abrir Bank of America/ }));
    return screen.findByRole('region', { name: `Movimientos de ${TITULO}` });
  }

  it('lo que debe entera, el mínimo y sus dos saldos', async () => {
    await entrar();
    expect(screen.getByText('Debes hoy').nextElementSibling).toHaveTextContent('$1,500.00');
    expect(screen.getAllByText(/Mínimo del estado/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('list', { name: `Saldos de ${TITULO}` })).toHaveLength(2);
  });

  it('pide el historial de cada tramo, y solo de esta tarjeta', async () => {
    await entrar();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const pedidos = fetchMock.mock.calls.map(([u]) => String(u));
    expect(pedidos.some((u) => u.includes(compras.id))).toBe(true);
    expect(pedidos.some((u) => u.includes(adelanto.id))).toBe(true);
    expect(pedidos.some((u) => u.includes(suelta.id))).toBe(false);
  });

  it('el abono de $156 sale UNA vez, con lo que fue a cada saldo', async () => {
    const region = await entrar();
    const abono = await within(region).findByText('Abono a la tarjeta');
    const linea = abono.closest('li') as HTMLElement;
    expect(linea).toHaveTextContent('−$156.00');
    expect(within(linea).getByText('Compras 3650').nextElementSibling).toHaveTextContent('$100.00');
    expect(within(linea).getByText('Adelanto 3650').nextElementSibling).toHaveTextContent('$56.00');
    expect(within(region).getByText('Consumo · Compras 3650')).toBeInTheDocument();
    expect(within(region).queryByText(/^Abono · /)).toBeNull();
  });

  it('si el historial no carga, lo dice y la hoja sigue', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    const region = await entrar();
    expect(await within(region).findByText('No se pudo cargar el historial')).toBeInTheDocument();
    expect(screen.getByText('Debes hoy')).toBeInTheDocument();
  });

  it('tocar un saldo cierra la tarjeta y abre ese tramo', async () => {
    const region = await entrar();
    const hoja = region.parentElement as HTMLElement;
    fireEvent.click(within(hoja).getByRole('button', { name: /Adelanto 3650/ }));
    expect(await screen.findByRole('heading', { name: /Adelanto 3650/ })).toBeInTheDocument();
    // La hoja se va con su animación de salida: se espera a que termine.
    await waitFor(() => expect(hojaAbierta()).toBeNull());
  });

  it('«Abonar a la tarjeta» del pie cierra la hoja y abre el abono', async () => {
    await entrar();
    const botones = screen.getAllByRole('button', { name: /Abonar a la tarjeta/ });
    fireEvent.click(botones[botones.length - 1]);
    expect(await screen.findByRole('heading', { name: 'Abonar a la tarjeta' })).toBeInTheDocument();
    await waitFor(() => expect(hojaAbierta()).toBeNull());
  });
});
