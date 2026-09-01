/**
 * scope-items.ts — de dónde sale «$4,444 de gasto personal».
 *
 * El plan enseñaba dos cifras, «gasto personal» y «gasto del negocio», sin
 * ninguna forma de abrirlas. Son la suma de cuatro cosas repartidas por su
 * porcentaje —recibos fijos, cuotas de crédito, super y lo que se va fuera del
 * super—, y de un vistazo no hay manera de reconstruirlas: un pago mixto al
 * 60 % aporta a los dos lados a la vez.
 *
 * Este módulo hace la cuenta al revés: dado un lado, devuelve LAS LÍNEAS que lo
 * componen, cada una con su importe repartido y el porcentaje aplicado. Es lo
 * que permite responder «¿por qué $4,444?» sin pedir que el usuario sume.
 *
 * Módulo PURO: sin SQL, sin React. Se prueba en scope-items.test.ts.
 */
import { normalizeShare, splitAmount } from './expense-scope';
import type { CreditInput, FixedPaymentInput, IncomeSource } from './finance-engine';
import { monthlyEquivalent } from './finance-engine';

export type ScopeSideKey = 'personal' | 'business';

/** De qué bloque del plan viene la línea. */
export type ScopeGroupKey = 'income' | 'payment' | 'credit' | 'grocery' | 'other';

export interface ScopeItem {
  id: string;
  label: string;
  emoji: string;
  group: ScopeGroupKey;
  /** Lo que esta línea aporta a ESTE lado. */
  amount: number;
  /** El importe completo, antes de repartir. */
  fullAmount: number;
  /** Qué porcentaje del total se fue a este lado (0–100). */
  sharePct: number;
  /** true cuando la línea está repartida entre los dos lados. */
  isSplit: boolean;
}

export interface ScopeGroup {
  key: ScopeGroupKey;
  label: string;
  emoji: string;
  total: number;
  items: ScopeItem[];
}

export interface ScopeItemization {
  side: ScopeSideKey;
  /** Suma de todo lo que SALE por este lado. */
  expenses: number;
  /** Lo que ENTRA por este lado. */
  income: number;
  expenseGroups: ScopeGroup[];
  incomeItems: ScopeItem[];
}

export interface ScopeItemsInput {
  incomes: readonly IncomeSource[];
  fixedPayments: readonly FixedPaymentInput[];
  credits: readonly CreditInput[];
  /** Estimado mensual de super y su porcentaje de negocio ponderado. */
  groceriesMonthly: number;
  groceriesBusinessShare: number;
  /** Lo que se va fuera del super, con su propio porcentaje. */
  otherExpensesMonthly: number;
  otherBusinessShare: number;
}

const GROUP_META: Record<ScopeGroupKey, { label: string; emoji: string }> = {
  income:  { label: 'Ingresos',            emoji: '💼' },
  payment: { label: 'Pagos fijos',         emoji: '📄' },
  credit:  { label: 'Cuotas de crédito',   emoji: '💳' },
  grocery: { label: 'Super',               emoji: '🛒' },
  other:   { label: 'Fuera del super',     emoji: '🍔' },
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Qué parte de `full` toca a este lado, con el porcentaje ya normalizado.
 *
 * `businessShare` siempre describe el lado NEGOCIO; para el personal es el
 * complemento. Se deriva en vez de guardarse por separado para que no puedan
 * contradecirse (ver expense-scope.ts).
 */
function forSide(full: number, businessShare: unknown, side: ScopeSideKey) {
  const share = normalizeShare(businessShare);
  const split = splitAmount(Math.max(0, full), share);
  const amount = side === 'business' ? split.business : split.personal;
  const pct = side === 'business' ? share : 100 - share;
  return { amount, pct, isSplit: share > 0 && share < 100 };
}

/**
 * La misma regla que el motor: una cuota que ya cobra un recibo de Pagos no se
 * cuenta otra vez. Si el enlace apunta a un recibo que ya no existe, vuelve a
 * contar — el dinero no puede desaparecer.
 */
function isCoveredByPayment(
  credit: CreditInput,
  fixedPayments: readonly FixedPaymentInput[],
): boolean {
  if (!credit.linkedPaymentId) return false;
  return fixedPayments.some((p) => p.id === credit.linkedPaymentId);
}

/** Solo las líneas que aportan algo: un $0 en la lista es ruido. */
const MIN_VISIBLE = 0.005;

export function itemizeScope(input: ScopeItemsInput, side: ScopeSideKey): ScopeItemization {
  const push = (list: ScopeItem[], item: ScopeItem) => {
    if (item.amount >= MIN_VISIBLE) list.push(item);
  };

  // ── Ingresos ───────────────────────────────────────────────────────────────
  const incomeItems: ScopeItem[] = [];
  for (const inc of input.incomes) {
    if (!inc.isActive) continue;
    const full = monthlyEquivalent(inc.amount, inc.frequency);
    const { amount, pct, isSplit } = forSide(full, inc.businessShare, side);
    push(incomeItems, {
      id: `income-${inc.id}`,
      label: inc.name || 'Ingreso',
      emoji: '💼',
      group: 'income',
      amount: round2(amount),
      fullAmount: round2(full),
      sharePct: pct,
      isSplit,
    });
  }

  // ── Pagos fijos ────────────────────────────────────────────────────────────
  const payments: ScopeItem[] = [];
  for (const p of input.fixedPayments) {
    const { amount, pct, isSplit } = forSide(p.amount, p.businessShare, side);
    push(payments, {
      id: `payment-${p.id}`,
      label: p.name || 'Pago',
      emoji: '📄',
      group: 'payment',
      amount: round2(amount),
      fullAmount: round2(Math.max(0, p.amount)),
      sharePct: pct,
      isSplit,
    });
  }

  // ── Cuotas de crédito ──────────────────────────────────────────────────────
  const credits: ScopeItem[] = [];
  for (const c of input.credits) {
    if (isCoveredByPayment(c, input.fixedPayments)) continue;
    const { amount, pct, isSplit } = forSide(c.installment, c.businessShare, side);
    push(credits, {
      id: `credit-${c.id}`,
      label: c.name || 'Crédito',
      emoji: '💳',
      group: 'credit',
      amount: round2(amount),
      fullAmount: round2(Math.max(0, c.installment)),
      sharePct: pct,
      isSplit,
    });
  }

  // ── Super y resto de gastos ────────────────────────────────────────────────
  // Van como UNA línea cada uno: el porcentaje de negocio es ponderado por el
  // importe de los tickets del mes, no ticket a ticket, así que abrirlos en
  // líneas daría una precisión que el dato no tiene.
  const groceries: ScopeItem[] = [];
  {
    const { amount, pct, isSplit } = forSide(input.groceriesMonthly, input.groceriesBusinessShare, side);
    push(groceries, {
      id: 'grocery',
      label: 'Compras del super',
      emoji: '🛒',
      group: 'grocery',
      amount: round2(amount),
      fullAmount: round2(Math.max(0, input.groceriesMonthly)),
      sharePct: pct,
      isSplit,
    });
  }

  const other: ScopeItem[] = [];
  {
    const { amount, pct, isSplit } = forSide(input.otherExpensesMonthly, input.otherBusinessShare, side);
    push(other, {
      id: 'other',
      label: 'Comida fuera, farmacia, gasolina',
      emoji: '🍔',
      group: 'other',
      amount: round2(amount),
      fullAmount: round2(Math.max(0, input.otherExpensesMonthly)),
      sharePct: pct,
      isSplit,
    });
  }

  const byAmount = (a: ScopeItem, b: ScopeItem) => b.amount - a.amount;

  const expenseGroups: ScopeGroup[] = (
    [
      ['payment', payments],
      ['credit', credits],
      ['grocery', groceries],
      ['other', other],
    ] as const
  )
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({
      key,
      label: GROUP_META[key].label,
      emoji: GROUP_META[key].emoji,
      total: round2(items.reduce((s, i) => s + i.amount, 0)),
      items: [...items].sort(byAmount),
    }))
    // El bloque más caro primero: es donde mirar si el número sorprende.
    .sort((a, b) => b.total - a.total);

  return {
    side,
    expenses: round2(expenseGroups.reduce((s, g) => s + g.total, 0)),
    income: round2(incomeItems.reduce((s, i) => s + i.amount, 0)),
    expenseGroups,
    incomeItems: [...incomeItems].sort(byAmount),
  };
}
