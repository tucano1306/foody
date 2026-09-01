import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, projectDebt } from '@/lib/debt-engine';
import DebtsView from './DebtsView';

function makeDebt(): DebtWithProjection {
  const base = {
    id: 'debt-1',
    userId: 'user-1',
    name: 'Tarjeta Azul',
    kind: 'credit_card' as const,
    issuer: 'Banco',
    accountLast4: '4321',
    currency: 'USD',
    originalAmount: 2000,
    currentBalance: 1200,
    rate: 3,
    ratePeriod: 'monthly' as const,
    strategy: 'fixed_installment' as const,
    termMonths: 24,
    payoffDate: null,
    customPayment: null,
    minPercent: 5,
    minFloor: 20,
    extraMonthly: 0,
    businessShare: 0,
    linkedPaymentId: null,
    duplicateDismissed: false,
    promoEndsOn: null,
    rateAfterPromo: null,
    cycleDays: null,
    statementDay: null,
    creditLimit: 3000,
    dueDay: 10,
    openedAt: '2026-01-10',
    lastAccrualAt: '2026-08-01',
    status: 'active' as const,
    note: null,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
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
    }),
    breakdown: {
      principalOwed: 1150,
      interestOwed: 50,
      feesOwed: 0,
      totalPaid: 800,
      totalInterestPaid: 300,
      totalPrincipalPaid: 500,
      progress: 25,
    },
    advice: [],
    daysUntilDue: 5,
    utilization: 40,
  };
}

function snapshot(): DebtsSnapshot {
  const debt = makeDebt();
  return { debts: [debt], portfolio: buildPortfolio([]) };
}

afterEach(() => {
  document.body.style.overflow = '';
});

/**
 * El bug que reportó el usuario: «gestiono algo en Deudas y la app se queda
 * pegada». No era la página: era el `overflow:hidden` del body, que sobrevive
 * a la navegación entre secciones porque `body` no se vuelve a crear.
 */
describe('DebtsView — la app no se queda pegada al gestionar una deuda', () => {
  it('devuelve el scroll tras el camino detalle → abonar → cerrar', async () => {
    render(<DebtsView initial={snapshot()} />);
    expect(document.body.style.overflow).toBe('');

    // 1. Abrir el detalle tocando la tarjeta.
    fireEvent.click(screen.getByRole('button', { name: /Tarjeta Azul/ }));
    const hoja = await screen.findByRole('heading', { name: /Tarjeta Azul/ });
    expect(document.body.style.overflow).toBe('hidden');

    // 2. «Abonar»: abre el modal de pago y cierra el detalle a la vez — aquí
    //    los dos modales conviven mientras el detalle se desvanece. El botón
    //    se busca DENTRO de la hoja: la tarjeta de la lista tiene otro igual.
    const dentroDeLaHoja = within(hoja.closest('div.fixed') as HTMLElement);
    fireEvent.click(dentroDeLaHoja.getByRole('button', { name: /Abonar$/ }));
    await screen.findByRole('heading', { name: 'Abonar' });

    // 3. El detalle termina de salir y se desmonta.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Tarjeta Azul/ })).toBeNull(),
    );
    // Con un modal todavía abierto, el fondo NO debe scrollear.
    expect(document.body.style.overflow).toBe('hidden');

    // 4. Cerrar el modal de abono: ya no queda ninguno.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Abonar' })).toBeNull());

    // 5. La app vuelve a scrollear. Antes se quedaba en 'hidden' para siempre.
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });

  it('devuelve el scroll tras el camino detalle → editar → cerrar', async () => {
    render(<DebtsView initial={snapshot()} />);

    fireEvent.click(screen.getByRole('button', { name: /Tarjeta Azul/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Editar datos/ }));
    await screen.findByRole('heading', { name: /Editar/ });

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Tarjeta Azul/ })).toBeNull(),
    );
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });
});
