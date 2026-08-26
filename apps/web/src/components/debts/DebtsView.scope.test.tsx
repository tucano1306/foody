import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, projectDebt } from '@/lib/debt-engine';
import DebtsView from './DebtsView';

function makeDebt(over: { id: string; name: string; balance: number; businessShare: number }): DebtWithProjection {
  const base = {
    id: over.id,
    userId: 'user-1',
    name: over.name,
    kind: 'credit_card' as const,
    issuer: 'Banco',
    accountLast4: '4321',
    currency: 'USD',
    originalAmount: over.balance,
    currentBalance: over.balance,
    rate: 0,
    ratePeriod: 'monthly' as const,
    strategy: 'fixed_installment' as const,
    termMonths: 10,
    payoffDate: null,
    customPayment: null,
    minPercent: 5,
    minFloor: 20,
    extraMonthly: 0,
    businessShare: over.businessShare,
    linkedPaymentId: null,
    duplicateDismissed: false,
    creditLimit: null,
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
      principalOwed: base.currentBalance,
      interestOwed: 0,
      feesOwed: 0,
      totalPaid: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      progress: 0,
    },
    advice: [],
    daysUntilDue: 20,
    utilization: null,
  };
}

/** Un coche 100 % del negocio, una tarjeta personal y una mixta al 50 %. */
const DEUDAS = [
  makeDebt({ id: 'auto', name: 'Auto del negocio', balance: 10_000, businessShare: 100 }),
  makeDebt({ id: 'visa', name: 'Visa personal', balance: 2_000, businessShare: 0 }),
  makeDebt({ id: 'mixta', name: 'Tarjeta mixta', balance: 1_000, businessShare: 50 }),
];

function snapshot(): DebtsSnapshot {
  return { debts: DEUDAS, portfolio: buildPortfolio([]) };
}

function pestana(nombre: RegExp) {
  return screen.getByRole('button', { name: nombre });
}

/** Los nombres de deuda son párrafos dentro de su tarjeta, no encabezados. */
function seVe(nombre: string): boolean {
  return screen.queryByText(nombre) !== null;
}

function cuantasTarjetas(): number {
  return ['Auto del negocio', 'Visa personal', 'Tarjeta mixta'].filter(seVe).length;
}

/**
 * «Lo que es del negocio es del negocio y lo que es personal es personal».
 *
 * La pantalla de Deudas enseñaba TODO junto, así que el número del Plan
 * financiero —que sí excluye el negocio— no había manera de cuadrarlo con lo
 * que se veía aquí.
 */
describe('DebtsView — filtro Personal / Negocio', () => {
  it('sin nada marcado como negocio, el selector ni aparece', () => {
    const soloPersonales = {
      debts: [makeDebt({ id: 'visa', name: 'Visa personal', balance: 2_000, businessShare: 0 })],
      portfolio: buildPortfolio([]),
    };
    render(<DebtsView initial={soloPersonales} />);
    expect(screen.queryByRole('button', { name: /Personal/ })).toBeNull();
  });

  it('arranca en «Todo» y enseña las tres deudas', () => {
    render(<DebtsView initial={snapshot()} />);
    expect(pestana(/Todo/)).toHaveAttribute('aria-pressed', 'true');
    expect(cuantasTarjetas()).toBe(3);
  });

  it('en «Personal» desaparece la del negocio', () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(pestana(/Personal/));

    expect(seVe('Visa personal')).toBe(true);
    expect(seVe('Tarjeta mixta')).toBe(true);
    expect(seVe('Auto del negocio')).toBe(false);
  });

  it('en «Negocio» desaparece la personal', () => {
    render(<DebtsView initial={snapshot()} />);
    fireEvent.click(pestana(/Negocio/));

    expect(seVe('Auto del negocio')).toBe(true);
    expect(seVe('Tarjeta mixta')).toBe(true);
    expect(seVe('Visa personal')).toBe(false);
  });

  it('la CARTERA de arriba también obedece al filtro', () => {
    // Lo que de verdad se pedía: el titular «Debes en total» no puede seguir
    // sumando el negocio cuando se está mirando lo personal.
    render(<DebtsView initial={snapshot()} />);

    /** El titular de la cartera, no el totalcito de la pestaña. */
    const debesEnTotal = () => screen.getByText('Debes en total').parentElement?.textContent ?? '';

    // Todo: 10.000 + 2.000 + 1.000 = 13.000
    expect(debesEnTotal()).toContain('13,000');

    // Personal: 2.000 + la mitad de la mixta = 2.500
    fireEvent.click(pestana(/Personal/));
    expect(debesEnTotal()).toContain('2,500');

    // Negocio: 10.000 + la otra mitad = 10.500
    fireEvent.click(pestana(/Negocio/));
    expect(debesEnTotal()).toContain('10,500');
  });

  it('abre en el ámbito que le pidan, sin tocar nada', () => {
    // Es como llega desde el Plan financiero: /debts?scope=personal
    render(<DebtsView initial={snapshot()} initialScope="personal" />);
    expect(pestana(/Personal/)).toHaveAttribute('aria-pressed', 'true');
    expect(seVe('Auto del negocio')).toBe(false);
  });
})
