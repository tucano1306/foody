import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtMovement, DebtWithProjection } from '@/lib/debt-data';
import { projectDebt } from '@/lib/debt-engine';
import DebtDetailSheet from './DebtDetailSheet';

/**
 * La Cash Rewards 8523 del 20 de septiembre: el caso que abrió esto.
 *
 * La pestaña «Historial» era una lista corrida de movimientos sin decir de
 * qué periodo hablaba. En una tarjeta eso no sirve: lo que se pregunta es
 * «¿cuánto llevo ESTE ciclo?», y el ciclo no empieza el día 1 del mes — empieza
 * al día siguiente del corte.
 */
const HOY = new Date(2026, 8, 20, 12); // 20 sep 2026

function iso(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d, 12).toISOString();
}

function mov(over: Partial<DebtMovement> & { id: string; occurredAt: string }): DebtMovement {
  return {
    debtId: 'debt-8523',
    kind: 'charge',
    amount: 0,
    interestPart: 0,
    principalPart: 0,
    feesPart: 0,
    balanceBefore: 0,
    balanceAfter: 0,
    paymentMethod: null,
    periodKey: null,
    note: null,
    ...over,
  };
}

/** Lo de la captura, más un consumo del ciclo anterior para poder navegar. */
const MOVIMIENTOS: DebtMovement[] = [
  mov({ id: 'm1', occurredAt: iso(2026, 9, 20), kind: 'payment', amount: 40, principalPart: 40, balanceAfter: 2009.38 }),
  mov({ id: 'm2', occurredAt: iso(2026, 9, 20), kind: 'payment', amount: 50, principalPart: 50, balanceAfter: 2049.38 }),
  mov({ id: 'm3', occurredAt: iso(2026, 9, 20), amount: 25, note: 'Exxon Giant 134' }),
  mov({ id: 'm4', occurredAt: iso(2026, 9, 20), amount: 11, note: 'Exxon 7 eleven' }),
  mov({ id: 'm5', occurredAt: iso(2026, 9, 20), amount: 40.98, note: 'Exxon 7 eleven' }),
  mov({ id: 'm6', occurredAt: iso(2026, 9, 20), amount: 20.42, note: 'Burger king' }),
  mov({ id: 'm7', occurredAt: iso(2026, 9, 20), amount: 22.99, note: 'Autozone coolant' }),
  mov({ id: 'm8', occurredAt: iso(2026, 9, 18), kind: 'payment', amount: 87, principalPart: 87, balanceBefore: 2187, balanceAfter: 2100 }),
  // Del ciclo anterior (cerró el 14 sep), no del que se abre por defecto.
  mov({ id: 'm9', occurredAt: iso(2026, 9, 10), amount: 300, note: 'Costco', balanceAfter: 2187 }),
  // Dos ciclos más atrás: entre este y el de septiembre queda uno sin nada.
  mov({ id: 'm10', occurredAt: iso(2026, 7, 10), amount: 60, note: 'Uber', balanceAfter: 1800 }),
];

function tarjeta(statementDay: number | null): DebtWithProjection {
  const base = {
    id: 'debt-8523',
    userId: 'user-1',
    name: 'Cash Rewards 8523',
    kind: 'credit_card' as const,
    issuer: 'Bank of America',
    accountLast4: '8523',
    currency: 'USD',
    originalAmount: 2500,
    currentBalance: 2009.38,
    rate: 18.49,
    ratePeriod: 'annual_nominal' as const,
    strategy: 'minimum' as const,
    termMonths: null,
    payoffDate: null,
    customPayment: null,
    minPercent: 2,
    minFloor: 25, minIncludesInterest: false,
    extraMonthly: 0,
    businessShare: 0,
    linkedPaymentId: null,
    duplicateDismissed: false,
    promoEndsOn: null,
    rateAfterPromo: null,
    cycleDays: 31,
    statementDay,
    creditLimit: 3000,
    dueDay: 5,
    openedAt: '2026-01-10',
    lastAccrualAt: '2026-09-01',
    status: 'active' as const,
    note: null,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };

  return {
    ...base,
    projection: projectDebt({
      balance: base.currentBalance,
      rate: base.rate,
      ratePeriod: base.ratePeriod,
      strategy: base.strategy,
      termMonths: base.termMonths,
      payoffDate: base.payoffDate,
      customPayment: base.customPayment,
      minPercent: base.minPercent,
      minFloor: base.minFloor,
      extraMonthly: base.extraMonthly,
      cycleDays: base.cycleDays,
      dueDay: base.dueDay,
      now: HOY,
    }),
    breakdown: {
      principalOwed: 2009.38,
      interestOwed: 0,
      feesOwed: 0,
      totalPaid: 177,
      totalInterestPaid: 0,
      totalPrincipalPaid: 177,
      progress: 7,
    },
    advice: [],
    daysUntilDue: 15,
    isOverdue: false,
    utilization: 67,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: HOY, toFake: ['Date'] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => MOVIMIENTOS }) as unknown as Response),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function abrirHistorial(statementDay: number | null, onEdit = vi.fn()) {
  const noop = () => {};
  render(
    <DebtDetailSheet
      debt={tarjeta(statementDay)}
      onClose={noop}
      onChanged={noop}
      onDeleted={noop}
      onPay={noop}
      onEdit={onEdit}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Historial/ }));
  await waitFor(() => expect(screen.getByLabelText('Ciclo anterior')).toBeInTheDocument());
  return { onEdit };
}

describe('DebtDetailSheet · Historial — el ciclo de la tarjeta, no una lista suelta', () => {
  it('abre en el ciclo en curso y dice exactamente cuál es', async () => {
    await abrirHistorial(14);
    expect(screen.getByText('15 sep – 14 oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/Ciclo en curso · corte el 14/)).toBeInTheDocument();
  });

  it('suma solo lo del ciclo: el consumo del 10 de septiembre es del anterior', async () => {
    await abrirHistorial(14);
    // 25 + 11 + 40.98 + 20.42 + 22.99 = 120.39 — sin los $300 del 10 sep.
    expect(screen.getByText('+$120.39')).toBeInTheDocument();
    expect(screen.getByText('−$177.00')).toBeInTheDocument();
    expect(screen.queryByText('Costco')).not.toBeInTheDocument();
  });

  it('la cuenta del ciclo se lee en el orden del estado de cuenta', async () => {
    await abrirHistorial(14);
    // Saldo anterior − pagos + compras = saldo de hoy, los mismos renglones
    // que imprime el banco y en el mismo orden.
    expect(screen.getByText('Saldo anterior')).toBeInTheDocument();
    expect(screen.getByText('$2,187.00')).toBeInTheDocument();
    expect(screen.getByText('Pagos y créditos')).toBeInTheDocument();
    expect(screen.getByText('Compras')).toBeInTheDocument();
  });

  it('dice sobre qué saldo cobra el interés el banco', async () => {
    await abrirHistorial(14);
    // No sobre el saldo de hoy: sobre el promedio de lo que se debió cada día.
    expect(screen.getByText(/Promedio diario/)).toBeInTheDocument();
    expect(screen.getByText(/el interés se cobra sobre esto/)).toBeInTheDocument();
  });

  it('en el ciclo en curso el saldo que enseña es el de hoy', async () => {
    await abrirHistorial(14);
    expect(screen.getByText('Saldo hoy')).toBeInTheDocument();
    // El del encabezado y el del pie del ciclo: la misma cifra, dos veces.
    expect(screen.getAllByText('$2,009.38').length).toBeGreaterThanOrEqual(2);
  });

  it('la flecha lleva al ciclo anterior, con sus propias cifras', async () => {
    await abrirHistorial(14);
    fireEvent.click(screen.getByLabelText('Ciclo anterior'));

    expect(screen.getByText('15 ago – 14 sep 2026')).toBeInTheDocument();
    expect(screen.getByText(/Ciclo cerrado/)).toBeInTheDocument();
    expect(screen.getByText(/Costco/)).toBeInTheDocument();
    // Dos veces: el total de consumos del ciclo y la fila del movimiento.
    expect(screen.getAllByText('+$300.00')).toHaveLength(2);
    // Ya cerrado: lo que vale es el saldo al corte, no el de hoy.
    expect(screen.getByText('Nuevo saldo al corte')).toBeInTheDocument();
    expect(screen.getByText('$2,187.00')).toBeInTheDocument();
  });

  it('no deja avanzar más allá del ciclo en curso', async () => {
    await abrirHistorial(14);
    expect(screen.getByLabelText('Ciclo siguiente')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Ciclo anterior'));
    expect(screen.getByLabelText('Ciclo siguiente')).toBeEnabled();

    fireEvent.click(screen.getByLabelText('Ciclo siguiente'));
    expect(screen.getByText('15 sep – 14 oct 2026')).toBeInTheDocument();
  });

  it('un ciclo sin movimientos lo dice, en vez de enseñar la lista entera', async () => {
    await abrirHistorial(14);
    fireEvent.click(screen.getByLabelText('Ciclo anterior'));
    fireEvent.click(screen.getByLabelText('Ciclo anterior'));
    expect(screen.getByText('15 jul – 14 ago 2026')).toBeInTheDocument();
    expect(screen.getByText('Sin movimientos en este ciclo')).toBeInTheDocument();

    // Y no es un callejón sin salida: el atajo salta al ciclo que sí tiene algo.
    fireEvent.click(screen.getByRole('button', { name: /Ver el ciclo anterior/ }));
    expect(screen.getByText('15 jun – 14 jul 2026')).toBeInTheDocument();
    expect(screen.getByText(/Uber/)).toBeInTheDocument();
  });

  it('no deja retroceder más allá del primer movimiento', async () => {
    await abrirHistorial(14);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText('Ciclo anterior'));
    expect(screen.getByText('15 jun – 14 jul 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Ciclo anterior')).toBeDisabled();
  });

  it('sin día de corte agrupa por mes natural y ofrece ponerlo', async () => {
    const { onEdit } = await abrirHistorial(null);
    expect(screen.getByText('septiembre 2026')).toBeInTheDocument();
    expect(screen.getByText(/Ciclo en curso · mes natural/)).toBeInTheDocument();
    // Aquí sí entra el consumo del 10 de septiembre: el mes natural lo incluye.
    expect(screen.getByText(/Costco/)).toBeInTheDocument();
    expect(screen.getByText('+$420.39')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Poner el día de corte/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('pide el libro completo, no los últimos movimientos', async () => {
    await abrirHistorial(14);
    const llamadas = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(String(llamadas[0][0])).toContain('limit=300');
  });

  it('cada movimiento del ciclo sigue siendo editable', async () => {
    await abrirHistorial(14);
    const fila = screen.getByText('Autozone coolant', { exact: false }).closest('div');
    expect(within(fila as HTMLElement).getByText('+$22.99')).toBeInTheDocument();
  });
});
