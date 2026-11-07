import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, projectDebt, type RatePeriod } from '@/lib/debt-engine';
import DebtsView from './DebtsView';

/**
 * El «⋯» de cada tarjeta de Deudas: abonar, cuadrar, condiciones del banco,
 * pasar a Metas y borrar, en un solo menú.
 *
 * Lo que motivó «Pasar a Metas»: perseguir una tarjeta desde el Plan era
 * teclear otra vez el nombre, el objetivo, lo pagado y la fecha. Aquí se
 * prueba que se crea de un toque con los datos de la deuda, que un segundo
 * toque no duplica, y que borrar nunca está a un toque de distancia.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

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

const unlimited = deuda('a0000000-0000-4000-8000-000000000001', 'Unlimited Cash 3650', 11_286, {
  originalAmount: 11_440, rate: 0, promoEndsOn: '2099-01-25', rateAfterPromo: 23.99,
});
const compras = deuda('a0000000-0000-4000-8000-000000000002', 'Compras 3650', 652.04, { originalAmount: 1026.54 });
const nuevo = deuda('a0000000-0000-4000-8000-000000000003', 'Saldo nuevo 3650', 553.4);
const TARJETA = [unlimited, compras, nuevo];

const auto = deuda('b0000000-0000-4000-8000-000000000001', 'Auto GMC', 9000, {
  kind: 'auto', issuer: 'GMC', accountLast4: null, cardGroup: null, rate: 6.5,
});

function snapshot(debts: DebtWithProjection[], extra: Partial<DebtsSnapshot> = {}): DebtsSnapshot {
  return {
    debts,
    portfolio: buildPortfolio([]),
    cardStatements: {
      [GRUPO]: {
        cardGroup: GRUPO, closingDate: '2026-10-27', minimumDue: 154, dueDate: '2026-11-22',
        newBalance: 12_491.44, paidSinceClosing: 154,
      },
    },
    ...extra,
  };
}

function menuDe(nombre: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: typeof nombre === 'string' ? `Más acciones de ${nombre}` : nombre }));
}

/** Los nombres de las acciones del menú abierto, en orden (sin su segunda línea). */
function accionesVisibles(): string[] {
  const hoja = screen.getByRole('dialog');
  return within(hoja)
    .getAllByRole('button')
    .filter((b) => b.textContent !== 'Cancelar')
    .map((b) => b.querySelector('span.truncate')?.textContent ?? '');
}

function respuesta(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
  document.body.style.overflow = '';
});

describe('el menú «⋯» de una tarjeta con tramos', () => {
  it('la tarjeta solo enseña «Abonar» y «⋯»: lo demás ya no son líneas sueltas', () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    expect(screen.getByRole('button', { name: /Abonar a la tarjeta/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cuadrar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Condiciones del banco/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Más acciones de Bank of America ···3650' })).toBeInTheDocument();
  });

  it('las cinco acciones, siempre en el mismo orden', () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    expect(accionesVisibles()).toEqual([
      'Abonar a la tarjeta',
      'Cuadrar con el estado de cuenta',
      'Condiciones del banco',
      'Pasar a Metas',
      'Borrar tarjeta',
    ]);
  });

  it('cada acción dice el dato que importa: el mínimo cubierto, el último cierre, cuántos tramos', () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    const hoja = within(screen.getByRole('dialog'));
    expect(hoja.getByText('Mínimo $154.00 · ✓ cubierto')).toBeInTheDocument();
    expect(hoja.getByText('El último cerró el 27 oct 2026')).toBeInTheDocument();
    expect(hoja.getByText('3 tramos · sin teclear nada')).toBeInTheDocument();
    expect(hoja.getByText('Va a la papelera con sus 3 tramos')).toBeInTheDocument();
  });

  it('«Abonar» del menú abre el mismo abono que el botón de la tarjeta', async () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Abonar a la tarjeta/ }));
    expect(await screen.findByRole('heading', { name: 'Abonar a la tarjeta' })).toBeInTheDocument();
  });

  it('«Cuadrar» abre el cuadre con el estado de cuenta', async () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Cuadrar con el estado de cuenta/ }));
    expect(await screen.findByRole('heading', { name: 'Cuadrar la tarjeta' })).toBeInTheDocument();
  });

  it('elegir una acción cierra el menú', () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Cuadrar con el estado de cuenta/ }));
    expect(screen.queryByRole('button', { name: /Borrar tarjeta/ })).toBeNull();
  });
});

describe('pasar la tarjeta a Metas, de un toque', () => {
  it('propone una meta por tramo, ya rellena y marcada, la del 0 % primero', async () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Pasar a Metas/ }));
    await screen.findByRole('heading', { name: 'Pasar a Metas' });

    const filas = screen.getAllByRole('button', { pressed: true });
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent('Unlimited Cash 3650');
    expect(filas[0]).toHaveTextContent('Antes del 25 ene 2099 · fin del 0 %');
    expect(filas[0]).toHaveTextContent('Meta $11,440.00');
    expect(filas[0]).toHaveTextContent('$11,286.00');
    expect(screen.getByRole('button', { name: /Crear 3 metas/ })).toBeEnabled();
  });

  it('tocar un tramo lo quita; el servidor recibe solo ids, nunca cifras', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respuesta({
        creadas: [
          { id: 'g1', name: 'Unlimited Cash 3650', debtId: unlimited.id },
          { id: 'g2', name: 'Compras 3650', debtId: compras.id },
        ],
        omitidas: [],
      }, 201),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Pasar a Metas/ }));
    await screen.findByRole('heading', { name: 'Pasar a Metas' });

    fireEvent.click(screen.getByRole('button', { name: /Saldo nuevo 3650/, pressed: true }));
    expect(screen.getByRole('button', { name: /Saldo nuevo 3650/, pressed: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Crear 2 metas/ }));

    await screen.findByText('2 metas nuevas');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/finance/goals/from-debts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ debtIds: [unlimited.id, compras.id] });
    expect(screen.getByRole('link', { name: /Ver mis Metas/ })).toHaveAttribute('href', '/plan#metas');
  });

  it('después, el menú sabe lo que ya está: queda un tramo, y luego «Ver en Metas»', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(respuesta({
        creadas: [
          { id: 'g1', name: 'Unlimited Cash 3650', debtId: unlimited.id },
          { id: 'g2', name: 'Compras 3650', debtId: compras.id },
        ],
        omitidas: [],
      }, 201))
      .mockResolvedValueOnce(respuesta({ creadas: [{ id: 'g3', name: 'Saldo nuevo 3650', debtId: nuevo.id }], omitidas: [] }, 201)));
    render(<DebtsView initial={snapshot(TARJETA)} />);

    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Pasar a Metas/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Saldo nuevo 3650/, pressed: true }));
    fireEvent.click(screen.getByRole('button', { name: /Crear 2 metas/ }));
    await screen.findByText('2 metas nuevas');
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByText('2 metas nuevas')).toBeNull());

    menuDe('Bank of America ···3650');
    expect(within(screen.getByRole('dialog')).getByText('1 tramo · sin teclear nada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pasar a Metas/ }));
    await screen.findByRole('heading', { name: 'Pasar a Metas' });
    expect(screen.getAllByText('✓ Ya en Metas')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Crear la meta/ }));
    await screen.findByText('1 meta nueva');
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByText('1 meta nueva')).toBeNull());

    menuDe('Bank of America ···3650');
    expect(screen.queryByRole('button', { name: /Pasar a Metas/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ver en Metas/ }));
    expect(push).toHaveBeenCalledWith('/plan#metas');
  });

  it('lo que ya venía enganchado desde el Plan no se ofrece otra vez', () => {
    render(<DebtsView initial={snapshot(TARJETA, { enMetas: TARJETA.map((d) => d.id) })} />);
    menuDe('Bank of America ···3650');
    expect(screen.queryByRole('button', { name: /Pasar a Metas/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Ver en Metas/ })).toBeInTheDocument();
  });

  it('si el servidor dice que no, la hoja se queda con el motivo y se puede reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ error: 'No se pudo pasar a Metas' }, 500)));
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Pasar a Metas/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Crear 3 metas/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo pasar a Metas');
    expect(screen.getByRole('button', { name: /Crear 3 metas/ })).toBeEnabled();
  });
});

describe('borrar la tarjeta: nunca a un toque', () => {
  it('pide confirmación, y «Mejor no» no toca nada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));

    const dialogo = await screen.findByRole('alertdialog', { name: '¿Borrar Bank of America ···3650?' });
    expect(dialogo).toHaveTextContent('Va a la papelera con sus 3 tramos y todo su historial. La recuperas cuando quieras.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mejor no' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Unlimited Cash 3650')).toBeInTheDocument();
  });

  it('confirmado, manda la tarjeta entera a la papelera y desaparece de la lista', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta({ borrados: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DebtsView initial={snapshot([...TARJETA, auto])} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, borrar' }));

    await waitFor(() => expect(screen.queryByText('Unlimited Cash 3650')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(`/api/debts/cards/${GRUPO}`, expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getAllByText('Auto GMC').length).toBeGreaterThan(0);
  });

  it('si tenía metas, avisa de que se quedan en el Plan', async () => {
    render(<DebtsView initial={snapshot(TARJETA, { enMetas: [unlimited.id] })} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Su meta se queda en el Plan.');
  });

  it('con varias metas, lo dice en plural', async () => {
    render(<DebtsView initial={snapshot(TARJETA, { enMetas: [unlimited.id, compras.id] })} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Sus 2 metas se quedan en el Plan.');
  });

  it('sin metas, no menciona el Plan', async () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));
    expect(await screen.findByRole('alertdialog')).not.toHaveTextContent('Plan');
  });

  it('si el servidor falla, la tarjeta sigue ahí', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ message: 'No se pudo borrar la tarjeta' }, 500)));
    render(<DebtsView initial={snapshot(TARJETA)} />);
    menuDe('Bank of America ···3650');
    fireEvent.click(screen.getByRole('button', { name: /Borrar tarjeta/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, borrar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sí, borrar' })).toBeEnabled());
    expect(screen.getByText('Unlimited Cash 3650')).toBeInTheDocument();
  });
});

describe('una deuda suelta también tiene su «⋯»', () => {
  it('abonar, editar, condiciones, pasar a Metas y borrar', () => {
    render(<DebtsView initial={snapshot([auto])} />);
    menuDe('Auto GMC');
    expect(accionesVisibles()).toEqual(['Abonar', 'Editar datos', 'Condiciones del banco', 'Pasar a Metas', 'Borrar deuda']);
  });

  it('«Editar datos» abre la edición', async () => {
    render(<DebtsView initial={snapshot([auto])} />);
    menuDe('Auto GMC');
    fireEvent.click(screen.getByRole('button', { name: /Editar datos/ }));
    expect(await screen.findByRole('heading', { name: 'Editar deuda' })).toBeInTheDocument();
  });

  it('pasar a Metas propone esa sola deuda', async () => {
    render(<DebtsView initial={snapshot([auto])} />);
    menuDe('Auto GMC');
    fireEvent.click(screen.getByRole('button', { name: /Pasar a Metas/ }));
    await screen.findByRole('heading', { name: 'Pasar a Metas' });
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Crear la meta/ })).toBeInTheDocument();
  });

  it('borrar va a la ruta de la deuda, no a la de una tarjeta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DebtsView initial={snapshot([auto])} />);
    menuDe('Auto GMC');
    fireEvent.click(screen.getByRole('button', { name: /Borrar deuda/ }));
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Borrar Auto GMC?' });
    expect(dialogo).toHaveTextContent('Va a la papelera con todo su historial. La recuperas cuando quieras.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, borrar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/debts/${auto.id}`, expect.objectContaining({ method: 'DELETE' })));
  });

  it('liquidada: sin «Abonar» ni «Pasar a Metas», pero el «⋯» sigue para borrarla', () => {
    const pagada = deuda('c0000000-0000-4000-8000-000000000001', 'Préstamo pagado', 0, {
      kind: 'loan', issuer: null, accountLast4: null, cardGroup: null, status: 'paid_off',
    });
    render(<DebtsView initial={snapshot([pagada])} />);
    menuDe('Préstamo pagado');
    expect(accionesVisibles()).toEqual(['Editar datos', 'Condiciones del banco', 'Borrar deuda']);
  });
});
