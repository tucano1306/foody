import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardStatementInfo, CreditForPlan, DebtWithProjection } from '@/lib/debt-data';
import { projectDebt, type RatePeriod } from '@/lib/debt-engine';
import type { DebtOverview } from '@/lib/finance-engine';
import { ToastProvider } from '@/components/ui/Toast';
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
    kind: 'credit_card',
    accountLast4: '3650',
    currency: 'USD',
    rate: 23.99,
    ratePeriod: 'annual_nominal',
    promoEndsOn: null,
    rateAfterPromo: null,
    promoKind: 'cero' as const,
    deferredInterest: null,
    openedAt: null,
    fueraDelPlan: false,
    ...over,
  };
}

const credits: CreditForPlan[] = [
  credito({ id: 'compras', name: 'Compras 3650', balance: 1177.04, installment: 158, monthlyInterest: 23.53 }),
  credito({ id: 'unlimited', name: 'Unlimited Cash 3650', balance: 11286, installment: 3762, rate: 0, promoEndsOn: '2027-01-25', rateAfterPromo: 23.99 }),
  credito({ id: 'saldo-nuevo', name: 'Saldo nuevo 3650', balance: 553.4, installment: 16.6, monthlyInterest: 11.06 }),
  credito({ id: '6791', name: 'Adelanto 0 % 6791', balance: 6052, installment: 550, cardGroup: null, accountLast4: '6791', rate: 0, promoEndsOn: '2027-09-27', rateAfterPromo: 27.49 }),
];

function overview(lista: readonly CreditForPlan[] = credits): DebtOverview {
  const creditOrder = [...lista]
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
  await import('@/components/debts/DebtDetailSheet');
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

/**
 * «Las tarjetas se ven muy unidas, cuesta saber cuál es cuál»: los tramos de
 * la 3650 eran cajas del mismo tono que «Cash Rewards 8523» y que la tarjeta
 * que los contenía. Ahora solo la cabecera de una cuenta lleva sello, los
 * tramos van en una bandeja propia y cada tarjeta suelta es una tarjeta.
 */
describe('cada tarjeta se distingue de la de al lado', () => {
  const sellos = () => [...document.querySelectorAll('[data-chip-cuenta]')].map((s) => s.getAttribute('data-chip-cuenta'));

  it('cada cuenta lleva un sello con sus dígitos, y sus tramos no', () => {
    render(<DebtPanel debts={overview()} credits={credits} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);

    // Una por cuenta y en el orden de la lista: la 3650 (sus tres saldos) y la 6791.
    expect(sellos()).toEqual(['3650', '6791']);
    const bandeja = screen.getByRole('list', { name: 'Saldos de Bank of America ···3650' });
    expect(bandeja.querySelector('[data-chip-cuenta]')).toBeNull();
  });

  it('una tarjeta suelta es una tarjeta entera, con su aviso del 0 % dentro', () => {
    // El aviso sale a 90 días o menos del fin del 0 %: la 6791 real acaba en
    // septiembre de 2027, así que aquí se acerca a fin de año.
    const cerca = credits.map((c) => (c.id === '6791' ? { ...c, promoEndsOn: '2026-12-31' } : c));
    render(<DebtPanel debts={overview(cerca)} credits={cerca} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);

    const suelta = screen.getByText('Adelanto 0 % 6791').closest('li');
    expect(suelta).toHaveClass('card');
    // El aviso iba DEBAJO de la fila, fuera de ella, y parecía de la tarjeta
    // siguiente; ahora vive dentro de su tarjeta.
    expect(within(suelta as HTMLElement).getByText(/El 0 % se acaba/)).toBeInTheDocument();
  });

  it('un préstamo lleva su emoji, no un plástico de tarjeta', () => {
    const conAuto = [
      ...credits,
      credito({ id: 'auto', name: 'Auto GMC', balance: 9000, installment: 420, cardGroup: null, kind: 'auto', issuer: 'GMC', accountLast4: null, rate: 6.5 }),
    ];
    render(<DebtPanel debts={overview(conAuto)} credits={conAuto} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);

    const auto = screen.getByText('Auto GMC').closest('li') as HTMLElement;
    expect(auto.querySelector('[data-chip-cuenta]')).toBeNull();
    expect(within(auto).getByText('🚗')).toBeInTheDocument();
    expect(sellos()).toEqual(['3650', '6791']);
  });

  it('al abrir un tramo, ese dice «Abriendo…» y los demás esperan', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    render(<DebtPanel debts={overview()} credits={credits} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />);

    const bandeja = within(screen.getByRole('list', { name: 'Saldos de Bank of America ···3650' }));
    fireEvent.click(bandeja.getByRole('button', { name: /Compras 3650/ }));

    await waitFor(() => expect(bandeja.getByRole('button', { name: /Compras 3650/ })).toHaveTextContent('Abriendo…'));
    for (const b of bandeja.getAllByRole('button')) expect(b).toBeDisabled();
    expect(bandeja.getByRole('button', { name: /Saldo nuevo 3650/ })).not.toHaveTextContent('Abriendo…');
  });
});

/**
 * «En el Plan me salen las 3 tarjetas, que no son metas; las quiero quitar de
 * allí con seguridad de que no se me van a borrar en Deudas». El 7 nov 2026 lo
 * único que había era «Borrar», y se las llevó de Deudas. Ahora el Plan quita
 * de la vista y no borra nada.
 */
describe('quitar una tarjeta del Plan sin tocarla en Deudas', () => {
  type Llamada = { url: string; method: string; body: unknown };
  let llamadas: Llamada[] = [];

  /** Un fetch que apunta cada llamada y responde por la URL. */
  function servidor(respuestas: { plan?: number; detalle?: DebtWithProjection } = {}) {
    llamadas = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      llamadas.push({
        url,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      });
      if (url.endsWith('/plan')) {
        return new Response(JSON.stringify({ clave: GRUPO }), { status: respuestas.plan ?? 200 });
      }
      if (url.includes('/movements')) return new Response('[]', { status: 200 });
      if (respuestas.detalle && url === `/api/debts/${respuestas.detalle.id}`) {
        return new Response(JSON.stringify(respuestas.detalle), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  /** Nada de lo que hizo la pantalla es un DELETE, y nada fue a otra ruta que /plan para escribir. */
  function noBorroNada() {
    expect(llamadas.filter((l) => l.method === 'DELETE')).toEqual([]);
    for (const l of llamadas.filter((x) => x.method !== 'GET')) expect(l.url).toMatch(/\/plan$/);
  }

  function pintar(lista: readonly CreditForPlan[] = credits) {
    return render(
      <ToastProvider>
        <DebtPanel debts={overview(lista)} credits={lista} estados={{ [GRUPO]: estado }} onChanged={vi.fn()} />
      </ToastProvider>,
    );
  }

  const tarjeta3650 = () => screen.queryByRole('list', { name: 'Saldos de Bank of America ···3650' });
  const saldoDeLaCabecera = () => screen.getByText('Saldo').nextElementSibling;

  it('cada cuenta del Plan tiene su «Quitar del Plan»: la tarjeta de tres saldos uno solo', () => {
    servidor();
    pintar();
    expect(screen.getAllByRole('button', { name: /^Quitar .* del Plan$/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Quitar Bank of America ···3650 del Plan',
      'Quitar Adelanto 0 % 6791 del Plan',
    ]);
  });

  it('al tocar, la tarjeta se va en el acto con sus tres saldos, se guarda con un PUT y el aviso dice que sigue en Deudas', async () => {
    servidor();
    pintar();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Bank of America ···3650 del Plan' }));

    // En el acto: sin esperar a la respuesta.
    expect(tarjeta3650()).toBeNull();
    expect(screen.queryByText('Compras 3650')).toBeNull();
    // La cabecera cuenta lo que se ve: solo la 6791.
    expect(saldoDeLaCabecera()).toHaveTextContent('$6,052');

    await waitFor(() => expect(llamadas).toHaveLength(1));
    // Con el id de un tramo: de qué cuenta se habla lo decide el servidor.
    expect(llamadas[0]).toEqual({ url: '/api/debts/compras/plan', method: 'PUT', body: { enPlan: false } });
    expect(await screen.findByText('Fuera del Plan · sigue en Deudas')).toBeInTheDocument();
    noBorroNada();

    // Y queda a mano para volver.
    const fuera = within(screen.getByRole('list', { name: 'Fuera del Plan' }));
    expect(fuera.getByText('Bank of America ···3650')).toBeInTheDocument();
    expect(screen.getByText(/Fuera del Plan · 1/)).toBeInTheDocument();
  });

  it('«Deshacer» la devuelve al Plan', async () => {
    servidor();
    pintar();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Bank of America ···3650 del Plan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));

    expect(tarjeta3650()).not.toBeNull();
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(llamadas[1]).toEqual({ url: '/api/debts/compras/plan', method: 'PUT', body: { enPlan: true } });
    expect(screen.queryByRole('list', { name: 'Fuera del Plan' })).toBeNull();
    noBorroNada();
  });

  it('si no se pudo guardar, la tarjeta vuelve y el aviso lo dice', async () => {
    servidor({ plan: 500 });
    pintar();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Adelanto 0 % 6791 del Plan' }));

    expect(await screen.findByText('No se pudo quitar del Plan')).toBeInTheDocument();
    expect(screen.getByText('Adelanto 0 % 6791')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Fuera del Plan' })).toBeNull();
  });

  it('lo que el servidor ya trae fuera del Plan no se lista, y «Mostrar» lo devuelve', async () => {
    servidor();
    const conLa6791Fuera = credits.map((c) => (c.id === '6791' ? { ...c, fueraDelPlan: true } : c));
    pintar(conLa6791Fuera);

    expect(screen.getByRole('button', { name: 'Quitar Bank of America ···3650 del Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar Adelanto 0 % 6791 del Plan' })).toBeNull();
    // Saldo de la 3650 sola.
    expect(saldoDeLaCabecera()).toHaveTextContent('$13,016');

    fireEvent.click(screen.getByRole('button', { name: 'Volver a mostrar Adelanto 0 % 6791 en el Plan' }));
    expect(screen.getByRole('button', { name: 'Quitar Adelanto 0 % 6791 del Plan' })).toBeInTheDocument();
    await waitFor(() => expect(llamadas).toHaveLength(1));
    expect(llamadas[0]).toEqual({ url: '/api/debts/6791/plan', method: 'PUT', body: { enPlan: true } });
    expect(await screen.findByText('De vuelta en el Plan')).toBeInTheDocument();
  });

  it('con todas fuera, la sección de tarjetas no se pinta y solo queda «Fuera del Plan»', () => {
    servidor();
    pintar(credits.map((c) => ({ ...c, fueraDelPlan: true })));
    expect(screen.queryByText('💳 Tarjetas y créditos')).toBeNull();
    expect(screen.getByText(/Fuera del Plan · 2/)).toBeInTheDocument();
  });

  it('la hoja de detalle abierta desde el Plan no ofrece borrar: ofrece quitar del Plan', async () => {
    const detalle = tramo('6791', 'Adelanto 0 % 6791', 6052, 0, { cardGroup: null, accountLast4: '6791' });
    servidor({ detalle });
    pintar();

    fireEvent.click(screen.getByText('Adelanto 0 % 6791').closest('button') as HTMLButtonElement);
    const quitar = await screen.findByRole('button', { name: 'Quitar del Plan' }, { timeout: 3000 });
    expect(screen.queryByText('Borrar esta deuda')).toBeNull();
    expect(screen.queryByText('Sí, borrar')).toBeNull();

    fireEvent.click(quitar);
    await waitFor(() => expect(llamadas.some((l) => l.method === 'PUT')).toBe(true));
    expect(llamadas.find((l) => l.method === 'PUT')).toEqual({
      url: '/api/debts/6791/plan', method: 'PUT', body: { enPlan: false },
    });
    expect(screen.queryByRole('button', { name: 'Quitar Adelanto 0 % 6791 del Plan' })).toBeNull();
    noBorroNada();
  });
});
