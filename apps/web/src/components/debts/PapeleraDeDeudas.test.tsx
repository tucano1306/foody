import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, projectDebt, type RatePeriod } from '@/lib/debt-engine';
import type { DeudaEnPapelera } from '@/lib/papelera-deudas';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import DebtsView from './DebtsView';
import DebtDetailSheet from './DebtDetailSheet';

/**
 * La papelera de Deudas.
 *
 * El 7 nov 2026 el dueño borró sus tarjetas desde el Plan creyendo que quitaba
 * las metas, y «Sí, borrar» se las llevó con todos sus abonos: hubo que
 * restaurar la base a una hora anterior. Aquí se prueba que borrar ya no
 * pierde nada: avisa a dónde fue, se deshace desde el propio aviso, y lo
 * borrado espera en una papelera de donde vuelve entero.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const GRUPO = '11111111-1111-4111-8111-111111111111';

function deuda(id: string, name: string, balance: number, extra: Partial<DebtWithProjection> = {}): DebtWithProjection {
  const base = {
    id,
    userId: 'user-1',
    name,
    kind: 'credit_card' as const,
    issuer: 'Bank of America',
    accountLast4: '3650',
    currency: 'USD',
    originalAmount: balance,
    currentBalance: balance,
    rate: 23.99,
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
    lastAccrualAt: '2026-10-25',
    status: 'active' as const,
    note: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-10-25T00:00:00.000Z',
    ...extra,
  };
  return {
    ...base,
    projection: projectDebt({ balance, rate: base.rate, ratePeriod: base.ratePeriod, strategy: 'minimum', minPercent: 1, minFloor: 35 }),
    breakdown: {
      principalOwed: balance, interestOwed: 0, feesOwed: 0, totalPaid: 0,
      totalInterestPaid: 0, totalPrincipalPaid: 0, progress: 0,
    },
    advice: [],
    daysUntilDue: 15,
    isOverdue: false,
    utilization: null,
  };
}

const unlimited = deuda('a0000000-0000-4000-8000-000000000001', 'Unlimited Cash 3650', 11_286);
const compras = deuda('a0000000-0000-4000-8000-000000000002', 'Compras 3650', 652.04);
const nuevo = deuda('a0000000-0000-4000-8000-000000000003', 'Saldo nuevo 3650', 553.4);
const TARJETA = [unlimited, compras, nuevo];

function snapshot(debts: DebtWithProjection[], extra: Partial<DebtsSnapshot> = {}): DebtsSnapshot {
  return { debts, portfolio: buildPortfolio([]), ...extra };
}

/**
 * La tarjeta, ya en la papelera, como la devuelve `listarPapelera`: los tres
 * tramos con la MISMA fecha, que es lo que hace de ellos un solo gesto.
 */
const BORRADA = new Date().toISOString();
const TARJETA_EN_PAPELERA: DeudaEnPapelera[] = TARJETA.map((d) => ({
  id: d.id,
  name: d.name,
  kind: d.kind,
  issuer: d.issuer,
  accountLast4: d.accountLast4,
  cardGroup: d.cardGroup,
  balance: d.currentBalance,
  currency: d.currency,
  deletedAt: BORRADA,
}));

function respuesta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Un servidor de mentira: cada petición, por método y ruta. */
function servidor(rutas: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const clave = `${init?.method ?? 'GET'} ${url}`;
    const r = rutas[clave];
    if (!r) throw new Error(`ruta no esperada: ${clave}`);
    return r();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function montar(initial: DebtsSnapshot) {
  return render(
    <ToastProvider>
      <DebtsView initial={initial} />
    </ToastProvider>,
  );
}

async function borrarLaTarjeta() {
  fireEvent.click(screen.getByRole('button', { name: 'Más acciones de Bank of America ···3650' }));
  fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, borrar' }));
  await waitFor(() => expect(screen.queryByText('Unlimited Cash 3650')).toBeNull());
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('borrar ya no pierde nada', () => {
  it('el aviso dice a dónde fue, y «Deshacer» devuelve la tarjeta entera', async () => {
    const fetchMock = servidor({
      [`DELETE /api/debts/cards/${GRUPO}`]: () => respuesta({ borrados: 3 }),
      [`POST /api/debts/${unlimited.id}/restore`]: () => respuesta({ recuperadas: 3 }),
      'GET /api/debts': () => respuesta(snapshot(TARJETA)),
    });
    montar(snapshot(TARJETA));
    await borrarLaTarjeta();

    expect(await screen.findByText('Tarjeta en la papelera')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('Unlimited Cash 3650')).toBeInTheDocument();
    expect(screen.getByText('Compras 3650')).toBeInTheDocument();
    expect(screen.getByText('Saldo nuevo 3650')).toBeInTheDocument();
    expect(await screen.findByText('Recuperada')).toBeInTheDocument();
    // Un solo POST con un tramo basta: el servidor trae los demás del mismo gesto.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    // Ya no queda nada en la papelera, así que no se pinta.
    expect(screen.queryByRole('button', { name: /Papelera/ })).toBeNull();
  });

  it('lo borrado espera en la Papelera, como la tarjeta que era, y «Recuperar» lo devuelve', async () => {
    servidor({
      [`DELETE /api/debts/cards/${GRUPO}`]: () => respuesta({ borrados: 3 }),
      [`POST /api/debts/${unlimited.id}/restore`]: () => respuesta({ recuperadas: 3 }),
      'GET /api/debts': () => respuesta(snapshot(TARJETA)),
    });
    montar(snapshot(TARJETA));
    await borrarLaTarjeta();

    const papelera = screen.getByRole('button', { name: /Papelera/ });
    expect(papelera).toHaveAttribute('aria-expanded', 'false');
    expect(papelera).toHaveTextContent('1');
    fireEvent.click(papelera);

    const lista = within(screen.getByRole('region', { name: 'Papelera' }));
    expect(lista.getByText('Bank of America ···3650')).toBeInTheDocument();
    expect(lista.getByText('$12,491.44 · 3 tramos · borrada hoy')).toBeInTheDocument();

    fireEvent.click(lista.getByRole('button', { name: 'Recuperar Bank of America ···3650' }));
    expect(await screen.findByText('Unlimited Cash 3650')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Papelera' })).toBeNull());
  });

  it('con todo borrado, la papelera sigue a la vista: es cuando más falta hace', () => {
    montar(snapshot([], { papelera: TARJETA_EN_PAPELERA }));
    expect(screen.getByRole('button', { name: /Papelera/ })).toBeInTheDocument();
  });

  it('si recuperar falla, se queda en la papelera y el aviso lo dice', async () => {
    servidor({
      [`POST /api/debts/${unlimited.id}/restore`]: () => respuesta({ message: 'No se pudo recuperar' }, 500),
    });
    montar(snapshot([], { papelera: TARJETA_EN_PAPELERA }));
    fireEvent.click(screen.getByRole('button', { name: /Papelera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar Bank of America ···3650' }));

    expect(await screen.findByText('No se pudo recuperar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recuperar Bank of America ···3650' })).toBeEnabled();
    expect(screen.queryByText('Unlimited Cash 3650')).toBeNull();
  });

  it('recuperada, pero sin poder repintar la lista: lo dice, para que no se recupere dos veces', async () => {
    servidor({
      [`POST /api/debts/${unlimited.id}/restore`]: () => respuesta({ recuperadas: 3 }),
      'GET /api/debts': () => respuesta({ message: 'boom' }, 500),
    });
    montar(snapshot([], { papelera: TARJETA_EN_PAPELERA }));
    fireEvent.click(screen.getByRole('button', { name: /Papelera/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar Bank of America ···3650' }));

    expect(await screen.findByText('Recuperada. Abre Deudas de nuevo para verla')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Papelera' })).toBeNull();
  });

  it('una deuda suelta borrada desde su «⋯» también se deshace, con su propio id', async () => {
    const auto = deuda('b0000000-0000-4000-8000-000000000001', 'Auto GMC', 9000, {
      kind: 'auto', issuer: 'GMC', accountLast4: null, cardGroup: null, rate: 6.5,
    });
    const fetchMock = servidor({
      [`DELETE /api/debts/${auto.id}`]: () => new Response(null, { status: 204 }),
      [`POST /api/debts/${auto.id}/restore`]: () => respuesta({ recuperadas: 1 }),
      'GET /api/debts': () => respuesta(snapshot([auto])),
    });
    montar(snapshot([auto]));
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de Auto GMC' }));
    fireEvent.click(screen.getByRole('button', { name: /Borrar deuda/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, borrar' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/debts/${auto.id}/restore`, expect.objectContaining({ method: 'POST' })),
    );
    expect((await screen.findAllByText('Auto GMC')).length).toBeGreaterThan(0);
  });
});

describe('la hoja de detalle dice a dónde va lo que se borra', () => {
  it('antes de confirmar avisa de la papelera (desde el Plan se llega aquí pensando en la meta)', () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta([])));
    const noop = () => {};
    render(<DebtDetailSheet debt={unlimited} onClose={noop} onChanged={noop} onDeleted={noop} onPay={noop} onEdit={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /Borrar esta deuda/ }));
    expect(screen.getByText('Va a la papelera de Deudas con todo su historial.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sí, borrar' })).toBeInTheDocument();
  });
});

describe('un aviso con botón', () => {
  function Disparador({ alTocar }: { readonly alTocar: () => void }) {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.show('Tarjeta en la papelera', 'success', { etiqueta: 'Deshacer', alTocar })}>
        disparar
      </button>
    );
  }

  it('ejecuta la acción una sola vez y se cierra', async () => {
    const alTocar = vi.fn();
    render(
      <ToastProvider>
        <Disparador alTocar={alTocar} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
    const deshacer = await screen.findByRole('button', { name: 'Deshacer' });
    fireEvent.click(deshacer);
    fireEvent.click(deshacer);
    expect(alTocar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull());
  });

  it('dura más que un aviso normal: a los 3 s sigue ahí para tocarlo', () => {
    vi.useFakeTimers();
    try {
      render(
        <ToastProvider>
          <Disparador alTocar={vi.fn()} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'disparar' }));
      vi.advanceTimersByTime(3000);
      expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
