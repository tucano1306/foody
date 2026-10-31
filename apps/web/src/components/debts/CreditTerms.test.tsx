import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { PLANTILLAS, type CondicionesDeCredito } from '@/lib/condiciones-credito';
import { buildPortfolio, projectDebt, type RatePeriod } from '@/lib/debt-engine';
import CreditTermsSheet from './CreditTermsSheet';
import DebtsView from './DebtsView';

/**
 * «Si alguien quiere usar esta aplicación podría tener condiciones de
 * préstamos diferentes a las mías». Aquí se prueba que cada cuenta puede
 * poner las reglas de SU banco y que la app las usa: el mínimo que propone, a
 * dónde va un abono, el interés diferido y lo que cuesta un atraso.
 */

const GRUPO = '11111111-1111-4111-8111-111111111111';

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
    promoKind: 'cero' as const,
    deferredInterest: null,
    cardGroup: GRUPO,
    cycleDays: 31,
    statementDay: 25,
    creditLimit: null,
    dueDay: 22,
    openedAt: '2026-08-01',
    lastAccrualAt: '2026-09-25',
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

const compras = tramo('compras', 'Compras 3650', 1164.26, 23.74);
const promoOct = tramo('promo-oct', 'Adelanto oct 3650', 699, 0, { promoEndsOn: '2099-10-25', rateAfterPromo: 23.74 });
const promoEne = tramo('promo-ene', 'Adelanto ene 3650', 11440, 0, { promoEndsOn: '2099-12-25', rateAfterPromo: 23.74 });
const TARJETA = [promoEne, compras, promoOct];

const BOFA: CondicionesDeCredito = {
  plantilla: 'bofa',
  minimo: PLANTILLAS.bofa.minimo,
  abono: 'ley_eeuu',
  atraso: { cargo: null, tasaPenal: null },
};

function snapshot(debts: DebtWithProjection[], creditTerms: Record<string, CondicionesDeCredito> = { [GRUPO]: BOFA }): DebtsSnapshot {
  return { debts, portfolio: buildPortfolio([]), creditTerms };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

async function abrirCondiciones(terms?: Record<string, CondicionesDeCredito>) {
  render(<DebtsView initial={snapshot(TARJETA, terms)} />);
  fireEvent.click(screen.getByRole('button', { name: /Condiciones del banco/ }));
  await screen.findByRole('heading', { name: 'Condiciones del banco' });
}

describe('la tarjeta dice de qué banco son sus reglas', () => {
  it('el botón enseña la plantilla, y abre las condiciones', async () => {
    render(<DebtsView initial={snapshot(TARJETA)} />);
    expect(screen.getByRole('button', { name: '🏦 Condiciones del banco · Bank of America' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Condiciones del banco/ }));
    expect(await screen.findByRole('heading', { name: 'Pago mínimo' })).toBeInTheDocument();
  });

  it('sin condiciones en el snapshot el botón no se queda mudo: abre las de por defecto', async () => {
    render(<DebtsView initial={{ debts: TARJETA, portfolio: buildPortfolio([]) }} />);
    fireEvent.click(screen.getByRole('button', { name: /Condiciones del banco/ }));
    expect(await screen.findByRole('heading', { name: 'Pago mínimo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Bank of America/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('las condiciones, con el saldo de cada uno', () => {
  it('con Bank of America el mínimo sale de su fórmula: 1 % de $13,303.26 → $133', async () => {
    await abrirCondiciones();
    expect(screen.getByText('Con tu saldo de hoy saldría').nextElementSibling).toHaveTextContent('$133.00');
  });

  it('otro banco: «un % del saldo» rellena el 5 % y el mínimo cambia al momento', async () => {
    await abrirCondiciones();
    fireEvent.click(screen.getByRole('button', { name: /^Un % del saldo/ }));
    expect(screen.getByLabelText('Porcentaje del saldo')).toHaveValue('5');
    // 5 % de 13,303.26 = 665.163, redondeado al alza.
    expect(screen.getByText('Con tu saldo de hoy saldría').nextElementSibling).toHaveTextContent('$665.17');
  });

  it('tocar el % ya no es Bank of America: es «a tu medida»', async () => {
    await abrirCondiciones();
    fireEvent.change(screen.getByLabelText('Porcentaje del saldo'), { target: { value: '2' } });
    expect(screen.getByText('✏️ A tu medida')).toBeInTheDocument();
  });

  it('el ejemplo del reparto sigue la regla elegida', async () => {
    await abrirCondiciones();
    const ejemplo = () => within(screen.getByRole('list', { name: 'Ejemplo de reparto' }));
    // Ley de EE. UU.: el mínimo ($133) al 0 % que caduca antes, el resto a compras.
    expect(ejemplo().getByText('$133.00')).toBeInTheDocument();
    expect(ejemplo().getByText('$367.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Al más caro/ }));
    expect(ejemplo().getAllByRole('listitem')).toHaveLength(1);
    expect(ejemplo().getByText('$500.00')).toBeInTheDocument();
    expect(ejemplo().getByText(/Compras 3650/)).toBeInTheDocument();
  });

  it('un interés diferido dice lo que cobrarían de golpe', async () => {
    await abrirCondiciones();
    expect(screen.queryByText(/de golpe/)).toBeNull();
    fireEvent.click(screen.getAllByRole('radio', { name: /Interés diferido/ })[0]);
    expect(screen.getAllByText(/de golpe/).length).toBeGreaterThan(0);
  });

  it('el atraso, con las cifras del estado, se dice en dinero', async () => {
    await abrirCondiciones();
    fireEvent.change(screen.getByLabelText('Cargo por atraso'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Tasa de castigo'), { target: { value: '29,99' } });
    const frase = screen.getByText(/Un atraso te costaría/);
    expect(frase).toHaveTextContent('$40.00');
    expect(frase).toHaveTextContent('29.99 %');
    expect(frase).toHaveTextContent(/más al mes/);
  });
});

describe('guardar', () => {
  it('manda las condiciones de la tarjeta y la lista enseña las nuevas', async () => {
    const nuevas: CondicionesDeCredito = { ...BOFA, plantilla: 'propia', minimo: { regla: 'suma', porcentaje: 2, piso: 35, fijo: null } };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot(TARJETA, { [GRUPO]: nuevas })), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await abrirCondiciones();
    fireEvent.change(screen.getByLabelText('Porcentaje del saldo'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Cargo por atraso'), { target: { value: '41' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar condiciones' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/debts/promo-ene/terms');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      plantilla: 'propia',
      minimo: { regla: 'suma', porcentaje: 2, piso: 35, fijo: null },
      abono: 'ley_eeuu',
      atraso: { cargo: 41, tasaPenal: null },
      promos: [
        { debtId: 'promo-ene', tipo: 'cero', interesDiferido: null },
        { debtId: 'promo-oct', tipo: 'cero', interesDiferido: null },
      ],
    });
    expect(await screen.findByRole('button', { name: '🏦 Condiciones del banco · a tu medida' })).toBeInTheDocument();
  });

  it('si el servidor dice que no, se queda abierto con su motivo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Escribe la cuota fija que te cobran' }), { status: 422 })));
    await abrirCondiciones();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar condiciones' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe la cuota fija que te cobran');
    expect(screen.getByRole('heading', { name: 'Condiciones del banco' })).toBeInTheDocument();
  });
});

describe('el abono usa la regla de SU banco', () => {
  it('con «al más caro», el mínimo va a compras y nada avisa de que no baja', async () => {
    render(<DebtsView initial={snapshot(TARJETA, { [GRUPO]: { ...BOFA, plantilla: 'propia', abono: 'cara_primero' } })} />);
    fireEvent.click(screen.getByRole('button', { name: /Abonar a la tarjeta/ }));
    await screen.findByRole('heading', { name: 'Abonar a la tarjeta' });
    fireEvent.change(screen.getByLabelText('Pago mínimo del estado de cuenta'), { target: { value: '156' } });
    fireEvent.change(screen.getByLabelText('Monto a abonar'), { target: { value: '156' } });

    const reparto = within(screen.getByRole('list', { name: 'Reparto del abono' }));
    expect(reparto.getAllByRole('listitem')).toHaveLength(1);
    expect(reparto.getByText('Compras 3650')).toBeInTheDocument();
    expect(screen.queryByText(/no baja/)).toBeNull();
  });

  it('el mínimo propuesto sale de sus condiciones: 5 % del saldo', async () => {
    const cincoPorCiento: CondicionesDeCredito = { ...BOFA, plantilla: 'porcentaje', minimo: PLANTILLAS.porcentaje.minimo };
    render(<DebtsView initial={snapshot(TARJETA, { [GRUPO]: cincoPorCiento })} />);
    fireEvent.click(screen.getByRole('button', { name: /Abonar a la tarjeta/ }));
    await screen.findByRole('heading', { name: 'Abonar a la tarjeta' });
    expect(screen.getByLabelText('Pago mínimo del estado de cuenta')).toHaveValue('665.17');
  });
});

describe('un préstamo', () => {
  it('solo tiene lo del atraso: su cuota la fija el contrato', () => {
    const coche = tramo('coche', 'Auto GMC', 18000, 6.9, { kind: 'auto', cardGroup: null, issuer: 'GM Financial' });
    render(<CreditTermsSheet tramos={[coche]} condiciones={BOFA} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByRole('heading', { name: 'Pago mínimo' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'A dónde va tu abono' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Si te atrasas' })).toBeInTheDocument();
  });
});
