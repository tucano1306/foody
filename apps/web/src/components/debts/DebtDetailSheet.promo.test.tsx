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

function tarjeta6791(): DebtWithProjection {
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
    strategy: 'by_date' as const,
    termMonths: null,
    payoffDate: '2027-09-27',
    customPayment: null,
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

  it('el ahorro no es cero: adelantarse esquiva el 27,49 % de después', () => {
    // A $480 la última cuota cae el 24/09/2027, tres días antes de que caduque
    // el 0 %. Lo que sobra pasa a pagar interés, y por eso abonar de más SÍ
    // ahorra dinero aunque la tasa de hoy sea 0.
    render(<PayoffSimulator debt={tarjeta6791()} />);
    const ahorro = screen.getByText('Te ahorras').nextElementSibling;
    expect(ahorro).not.toHaveTextContent('—');
  });
});

/**
 * Lo que la tarjeta 6791 enseña en pantalla una vez configurada con el estado
 * real. El resumen es la única pantalla donde el 0 % y su fecha de caducidad se
 * ven juntos, así que se comprueba con las cifras del banco, no con mocks.
 */
describe('DebtDetailSheet — el resumen de la 6791 con los datos del banco', () => {
  function abrir() {
    const noop = () => {};
    render(
      <DebtDetailSheet
        debt={tarjeta6791()}
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

  it('avisa de que a $480 se llega a esa fecha debiendo todavía $480', () => {
    // 12 ciclos completos caben antes del 27/09/2027; la cuota número 13
    // llega justo al filo. Ese resto es lo que empieza a pagar el 27,49 %.
    abrir();
    expect(screen.getByText(/llegarás a esa fecha debiendo/)).toHaveTextContent('$480.00');
    expect(screen.getByText(/la liquidas a tiempo/)).toHaveTextContent('$520.00');
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
