import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinancePlanPayload } from '@/lib/finance-data';
import { buildFinancePlan, goalWithDebt, type FinanceGoal, type PlanInput } from '@/lib/finance-engine';
import { EMPTY_GROCERY_INSIGHT } from '@/lib/grocery-insights';
import { EMPTY_OTHER_SPEND } from '@/lib/other-spend';
import FinancePlanView from './FinancePlanView';

/**
 * «Si yo hago abonos en Deudas… se debe reflejar también en Metas, y la meta
 * actualizarse.»
 *
 * El servidor ya calculaba la meta con el saldo nuevo. Lo que fallaba era la
 * pantalla: guardaba la foto con la que se abrió y no volvía a mirar. Al
 * volver a la app, al deslizar para recargar o al volver atrás desde Deudas,
 * el plan nuevo llegaba y se tiraba, y la meta seguía sin el abono.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));
vi.mock('@/lib/fx', () => ({ confettiRain: vi.fn(), burstAt: vi.fn() }));

const DEUDA = 'd0000000-0000-4000-8000-000000000001';
const META = 'Liquidar la 8523';

/** El plan con la tarjeta debiendo `saldo`, calculado hace `haceMs`. */
function plan(saldo: number, haceMs = 0): FinancePlanPayload {
  const meta: FinanceGoal = goalWithDebt(
    {
      id: 'g1', name: META, emoji: '💳', kind: 'debt', targetAmount: 1, savedAmount: 0, targetDate: null,
      priority: 1, monthlyOverride: null, status: 'active', note: null,
      createdAt: '2026-10-01T00:00:00.000Z', debtId: DEUDA,
    },
    { originalAmount: 1000, currentBalance: saldo },
  );
  const input: PlanInput = {
    incomes: [{ id: 'i1', name: 'Sueldo', amount: 5000, frequency: 'monthly', isActive: true, note: null }],
    goals: [meta],
    fixedPayments: [],
    groceriesMonthly: 400,
    groceriesSource: 'limit',
    groceriesSpentThisMonth: 100,
  };
  return {
    ...buildFinancePlan(input),
    generatedAt: new Date(Date.now() - haceMs).toISOString(),
    incomes: [...input.incomes],
    rawGoals: [meta],
    contributions: [],
    groceries: { ...EMPTY_GROCERY_INSIGHT },
    otherSpend: { ...EMPTY_OTHER_SPEND },
    groceriesBusinessShare: 0,
    otherBusinessShare: 0,
    duplicateObligations: [],
    history: [],
    payments: [],
    credits: [],
  };
}

/** Lo que dice la tarjeta de la meta: «$200 de $1,000». */
function llevas(): string {
  const tarjeta = screen.getByRole('heading', { name: META }).closest('article') as HTMLElement;
  return within(tarjeta).getByText(/de \$1,000/).parentElement?.textContent ?? '';
}

function servidor(responder: () => Promise<Response>) {
  const f = vi.fn(async (url: string) => (url === '/api/finance/plan' ? responder() : new Response('{}', { status: 404 })));
  vi.stubGlobal('fetch', f);
  return f;
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('el Plan toma la foto nueva que le manda el servidor', () => {
  it('al volver a la app o deslizar para recargar, la meta enseña el abono', () => {
    const f = servidor(async () => json(plan(700)));
    const { rerender } = render(<FinancePlanView initialData={plan(800)} />);
    expect(llevas()).toBe('$200 de $1,000');

    // `router.refresh()` vuelve a pintar la página con el plan recalculado.
    rerender(<FinancePlanView initialData={plan(700)} />);

    expect(llevas()).toBe('$300 de $1,000');
    expect(f).not.toHaveBeenCalled();
  });

  it('una tarjeta liquidada en Deudas saca la meta de las activas', () => {
    servidor(async () => json(plan(0)));
    const { rerender } = render(<FinancePlanView initialData={plan(800)} />);
    expect(screen.getByRole('button', { name: /Abonar la tarjeta/ })).toBeInTheDocument();

    rerender(<FinancePlanView initialData={plan(0)} />);

    expect(screen.queryByRole('button', { name: /Abonar la tarjeta/ })).toBeNull();
    expect(screen.getByText(/Metas logradas \(1\)/)).toBeInTheDocument();
  });
});

describe('una foto vieja se relee sola al abrir', () => {
  it('volver atrás desde Deudas: la página llega como estaba y se pone al día', async () => {
    const f = servidor(async () => json(plan(700)));
    // Diez minutos en la otra pantalla: lo que Next devuelve del historial.
    render(<FinancePlanView initialData={plan(800, 10 * 60_000)} />);

    await waitFor(() => expect(llevas()).toBe('$300 de $1,000'));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('una foto recién calculada no se vuelve a pedir', async () => {
    const f = servidor(async () => json(plan(700)));
    render(<FinancePlanView initialData={plan(800)} />);

    await new Promise((r) => setTimeout(r, 30));
    expect(f).not.toHaveBeenCalled();
    expect(llevas()).toBe('$200 de $1,000');
  });

  it('sin red se queda con lo que tenía, sin romperse', async () => {
    const f = servidor(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<FinancePlanView initialData={plan(800, 10 * 60_000)} />);

    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(llevas()).toBe('$200 de $1,000');
  });
});
