import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { DebtWithProjection } from '@/lib/debt-data';
import { projectDebt } from '@/lib/debt-engine';
import DebtDetailSheet from './DebtDetailSheet';

/**
 * «En Historial se registra un consumo, pero deberia tener la opcion de
 * MODIFICAR un registro y no borrarlo y crearlo de nuevo.»
 *
 * Antes solo habia papelera. Borrar y volver a crear pierde la fecha original,
 * mueve el orden del historial y deja la deuda descuadrada en el hueco entre
 * las dos acciones --si el usuario se distrae, el dinero se fue.
 */
const HOY = new Date(2026, 8, 6);

const MOVIMIENTOS = [
  {
    id: 'm1', debtId: 'd1', kind: 'charge' as const, amount: 128,
    interestPart: 0, principalPart: 128, feesPart: 0,
    balanceBefore: 2046.4, balanceAfter: 2174.4,
    paymentMethod: null, periodKey: null, note: null,
    occurredAt: '2026-09-06T12:00:00.000Z',
  },
];

function tarjeta(): DebtWithProjection {
  const base = {
    id: 'd1', userId: 'u1', name: 'Cash Rewards 8523', kind: 'credit_card' as const,
    issuer: 'Bank of America', accountLast4: '8523', currency: 'USD',
    originalAmount: 2301.42, currentBalance: 2174.4, rate: 18.49,
    ratePeriod: 'annual_nominal' as const, strategy: 'interest_only' as const,
    termMonths: null, payoffDate: null, customPayment: null, minPercent: null,
    minFloor: 53, extraMonthly: 0, businessShare: 0, linkedPaymentId: null,
    duplicateDismissed: false, promoEndsOn: null, rateAfterPromo: null,
    cycleDays: 31, statementDay: 10, creditLimit: 2200, dueDay: 7,
    openedAt: '2026-08-06', lastAccrualAt: '2026-09-06', status: 'active' as const,
    note: null, createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
  };
  return {
    ...base,
    projection: projectDebt({
      balance: base.currentBalance, rate: base.rate, ratePeriod: base.ratePeriod,
      strategy: base.strategy, minFloor: base.minFloor, cycleDays: base.cycleDays,
      dueDay: base.dueDay, now: HOY,
    }),
    breakdown: {
      principalOwed: 2174.4, interestOwed: 0, feesOwed: 0, totalPaid: 60,
      totalInterestPaid: 0, totalPrincipalPaid: 127.02, progress: 6,
    },
    advice: [], daysUntilDue: 1, isOverdue: false, utilization: 99,
  };
}

function abrirHistorial() {
  const noop = () => {};
  render(
    <DebtDetailSheet debt={tarjeta()} onClose={noop} onChanged={noop} onDeleted={noop} onPay={noop} onEdit={noop} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Historial/ }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === undefined) {
      return { ok: true, json: async () => MOVIMIENTOS } as unknown as Response;
    }
    return { ok: true, json: async () => tarjeta() } as unknown as Response;
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('Historial — corregir un movimiento en su sitio', () => {
  it('tocar la fila abre el editor con lo que ya hay', async () => {
    abrirHistorial();
    fireEvent.click(await screen.findByRole('button', { name: /^Consumo/ }));
    expect(screen.getByLabelText('Importe de Consumo')).toHaveValue('128');
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-09-06');
  });

  it('guarda con PATCH, sin borrar ni volver a crear', async () => {
    abrirHistorial();
    fireEvent.click(await screen.findByRole('button', { name: /^Consumo/ }));
    fireEvent.change(screen.getByLabelText('Importe de Consumo'), { target: { value: '12.80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      const llamadas = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const patch = llamadas.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch![0]).toBe('/api/debts/d1/movements/m1');
      expect(JSON.parse((patch![1] as RequestInit).body as string).amount).toBe(12.8);
    });
    // Y ningun DELETE: corregir no es borrar.
    const llamadas = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(llamadas.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false);
  });

  it('acepta coma decimal, como el resto de la app', async () => {
    abrirHistorial();
    fireEvent.click(await screen.findByRole('button', { name: /^Consumo/ }));
    fireEvent.change(screen.getByLabelText('Importe de Consumo'), { target: { value: '12,80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => {
      const patch = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
        .find((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(JSON.parse((patch![1] as RequestInit).body as string).amount).toBe(12.8);
    });
  });

  it('la papelera sigue ahi: corregir y deshacer son cosas distintas', async () => {
    abrirHistorial();
    expect(await screen.findByRole('button', { name: /Deshacer Consumo/ })).toBeInTheDocument();
  });

  it('cancelar cierra el editor sin llamar a nadie', async () => {
    abrirHistorial();
    fireEvent.click(await screen.findByRole('button', { name: /^Consumo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Importe de Consumo')).not.toBeInTheDocument();
    const llamadas = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(llamadas.every((c) => (c[1] as RequestInit)?.method === undefined)).toBe(true);
  });
});
