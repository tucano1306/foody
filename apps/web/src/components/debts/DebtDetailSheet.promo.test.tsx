import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection } from '@/lib/debt-data';
import { projectDebt } from '@/lib/debt-engine';
import DebtDetailSheet from './DebtDetailSheet';
import PayoffSimulator from './PayoffSimulator';

/**
 * El caso real: la tarjeta 6791 del estado de Bank of America del 27/08/2026.
 *
 *   Saldo            $6,240.00 (adelanto de $6,000 + $240 de cargo)
 *   Promoción        0 % hasta el 27/09/2027, después 27,49 %
 *   Plan             liquidarla por fecha, $480.00 al mes
 *
 * La hoja de detalle decía «Libre en 1 año y 1 mes» y, unos centímetros más
 * abajo, el simulador decía que la deuda era ETERNA. Las dos frases salían del
 * mismo motor: la segunda porque el simulador no le pasaba la fecha límite —
 * sin ella la estrategia `by_date` no sabe calcular cuota y devuelve 0 — ni la
 * promoción, así que tampoco veía el interés que empieza el día que caduca.
 */
const HOY = new Date(2026, 7, 30); // 30 de agosto de 2026

/**
 * `cuota` cambia solo el ritmo de pago, no el credito: sirve para ver la misma
 * tarjeta llegando a tiempo y no llegando.
 */
function tarjeta6791(cuota?: number): DebtWithProjection {
  const base = {
    id: 'debt-6791',
    userId: 'user-1',
    name: 'Adelanto 0 % 6791',
    kind: 'credit_card' as const,
    issuer: 'Bank of America',
    accountLast4: '6791',
    currency: 'USD',
    originalAmount: 6240,
    currentBalance: 6240,
    rate: 0,
    ratePeriod: 'annual_nominal' as const,
    strategy: (cuota ? 'custom' : 'by_date') as 'custom' | 'by_date',
    termMonths: null,
    payoffDate: '2027-09-27',
    customPayment: cuota ?? null,
    minPercent: null,
    minFloor: 62,
    extraMonthly: 0,
    businessShare: 0,
    linkedPaymentId: null,
    duplicateDismissed: false,
    promoEndsOn: '2027-09-27',
    rateAfterPromo: 27.49,
    cycleDays: 31,
    statementDay: 27,
    creditLimit: 6300,
    dueDay: 24,
    openedAt: '2026-08-18',
    lastAccrualAt: '2026-08-18',
    status: 'active' as const,
    note: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
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
      promoEndsOn: base.promoEndsOn,
      rateAfterPromo: base.rateAfterPromo,
      cycleDays: base.cycleDays,
      dueDay: base.dueDay,
      now: HOY,
    }),
    breakdown: {
      // Como los deriva el servidor del libro mayor: el adelanto es capital,
      // el cargo por la transaccion NO.
      principalOwed: 6000,
      interestOwed: 0,
      feesOwed: 240,
      totalPaid: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      progress: 0,
    },
    advice: [],
    daysUntilDue: 25,
    isOverdue: false,
    utilization: 99,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: HOY, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PayoffSimulator — la tarjeta al 0 % que se paga por fecha', () => {
  it('no contradice a la hoja: esta deuda NO es eterna', () => {
    render(<PayoffSimulator debt={tarjeta6791()} />);
    expect(screen.queryByText(/eterna/i)).not.toBeInTheDocument();
  });

  it('cuenta los meses que ahorra el abono extra', () => {
    render(<PayoffSimulator debt={tarjeta6791()} />);
    const antes = screen.getByText('Terminas antes').nextElementSibling;
    expect(antes).not.toHaveTextContent('—');
  });

  it('a $480 no hay intereses que ahorrar, porque no llega a haberlos', () => {
    // Las trece cuotas caben antes del 27/09/2027, asi que el 27,49 % nunca
    // llega a correr. Prometer un ahorro aqui seria inventarlo.
    render(<PayoffSimulator debt={tarjeta6791()} />);
    expect(screen.getByText('Te ahorras').nextElementSibling).toHaveTextContent('—');
  });

  it('a $400 sí lo hay: el saldo sobrevive a la promo y empieza a pagar 27,49 %', () => {
    // La misma tarjeta a un ritmo que no llega. Este ahorro NO existe en la
    // tasa de hoy —que es 0 %—: existe solo porque el motor ve la promoción
    // caducar. Sin pasarsela, el simulador ofrecia un «—» aqui.
    render(<PayoffSimulator debt={tarjeta6791(400)} />);
    expect(screen.getByText('Te ahorras').nextElementSibling).not.toHaveTextContent('—');
  });
});

/**
 * Lo que la tarjeta 6791 enseña en pantalla una vez configurada con el estado
 * real. El resumen es la única pantalla donde el 0 % y su fecha de caducidad se
 * ven juntos, así que se comprueba con las cifras del banco, no con mocks.
 */
describe('DebtDetailSheet — el resumen de la 6791 con los datos del banco', () => {
  function abrir(cuota?: number) {
    const noop = () => {};
    render(
      <DebtDetailSheet
        debt={tarjeta6791(cuota)}
        onClose={noop}
        onChanged={noop}
        onDeleted={noop}
        onPay={noop}
        onEdit={noop}
      />,
    );
  }

  it('dice que el 0 % caduca, y en qué fecha', () => {
    abrir();
    expect(screen.getByText(/0 % hasta el/)).toHaveTextContent('27 sep 2027');
  });

  it('a $480 dice que llega, porque las trece cuotas caben', () => {
    // Vence el 24 y la promo muere el 27/09/2027: la ultima cuota cae el
    // 24/09/2027, tres dias antes. Contando meses completos desde un 30 de
    // agosto salian doce, y la hoja avisaba de un descubierto que no existe.
    abrir();
    expect(screen.getByText(/0 % hasta el/)).toHaveTextContent('✅');
    // Y lo dice de forma comprobable: ahi esta el margen entero, tres dias.
    expect(screen.getByText(/la última cuota cae el/)).toHaveTextContent('24 sep 2027');
  });

  it('a $400 avisa, y dice con cuánto se arregla', () => {
    abrir(400);
    expect(screen.getByText(/0 % hasta el/)).toHaveTextContent('⏳');
    expect(screen.getByText(/llegarás a esa fecha debiendo/)).toHaveTextContent('$1,040.00');
    // 6240 / 13 vencimientos = 480.
    expect(screen.getByText(/la liquidas a tiempo/)).toHaveTextContent('$480.00');
  });

  it('separa el cargo del adelanto: no es capital', () => {
    abrir();
    expect(screen.getByText('Capital pendiente').nextElementSibling).toHaveTextContent('$6,000.00');
    expect(screen.getByText('Comisiones').nextElementSibling).toHaveTextContent('$240.00');
  });

  it('el día de pago es el del banco, no el que estaba puesto', () => {
    abrir();
    expect(screen.getByText('Día de pago').nextElementSibling).toHaveTextContent('Día 24');
  });
});
