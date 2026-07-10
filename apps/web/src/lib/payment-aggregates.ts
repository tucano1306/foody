/**
 * Shared aggregate helpers for monthly payments.
 *
 * A month counts as "unpaid" once its due date passed without a paid record,
 * starting from the month the payment was created. The oldest unpaid month is
 * always settled first when the user marks the payment as paid, so the
 * accumulated debt drains month by month.
 *
 * Used by the API routes AND the server-side data layer (lib/api.ts) so both
 * return exactly the same numbers, and by client components for month labels.
 */

export interface UnpaidMonth {
  month: number; // 1-12
  year: number;
}

export interface PaidRecordInput {
  month: number;
  year: number;
  amount: number;
  actualAmount: number | null;
  paidAt: string | null; // ISO
}

export interface PaymentAggregates {
  isPaidThisMonth: boolean;
  /** Months whose due date passed without payment — oldest first. */
  unpaidMonths: UnpaidMonth[];
  missedMonths: number;
  accumulatedDebt: number;
  /** All-time sum actually paid (Σ actualAmount ?? amount). */
  totalPaidAllTime: number;
  /** All-time count of paid records. */
  paidCountAllTime: number;
  /** ISO timestamp of the most recent paid record. */
  lastPaidAt: string | null;
}

export const EMPTY_AGGREGATES: PaymentAggregates = {
  isPaidThisMonth: false,
  unpaidMonths: [],
  missedMonths: 0,
  accumulatedDebt: 0,
  totalPaidAllTime: 0,
  paidCountAllTime: 0,
  lastPaidAt: null,
};

export function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Safety cap when walking months (10 years). */
const MAX_MONTHS = 120;

/**
 * Months (from the payment's creation month) whose due date already passed
 * without a paid record — oldest first. The current month is included once
 * its due day is over.
 */
export function listUnpaidMonths(
  createdAt: Date,
  dueDay: number,
  paidKeys: ReadonlySet<string>,
  now: Date = new Date(),
): UnpaidMonth[] {
  const out: UnpaidMonth[] = [];
  const cursor = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
  for (let i = 0; i < MAX_MONTHS; i++) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const daysInMonth = new Date(y, m, 0).getDate();
    const due = new Date(y, m - 1, Math.min(dueDay, daysInMonth), 23, 59, 59, 999);
    if (due >= now) break;
    if (!paidKeys.has(monthKey(y, m))) out.push({ month: m, year: y });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export function buildPaymentAggregates(params: {
  createdAt: Date;
  dueDay: number;
  amount: number;
  paidRecords: readonly PaidRecordInput[];
  now?: Date;
}): PaymentAggregates {
  const now = params.now ?? new Date();
  const paidKeys = new Set(params.paidRecords.map((r) => monthKey(r.year, r.month)));
  const unpaidMonths = listUnpaidMonths(params.createdAt, params.dueDay, paidKeys, now);
  let totalPaidAllTime = 0;
  let lastPaidAt: string | null = null;
  for (const rec of params.paidRecords) {
    totalPaidAllTime += rec.actualAmount ?? rec.amount;
    if (rec.paidAt && (!lastPaidAt || rec.paidAt > lastPaidAt)) lastPaidAt = rec.paidAt;
  }
  return {
    isPaidThisMonth: paidKeys.has(monthKey(now.getFullYear(), now.getMonth() + 1)),
    unpaidMonths,
    missedMonths: unpaidMonths.length,
    accumulatedDebt: unpaidMonths.length * params.amount,
    totalPaidAllTime,
    paidCountAllTime: params.paidRecords.length,
    lastPaidAt,
  };
}

// ─── Month labels (es) ────────────────────────────────────────────────────────

export const SHORT_MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

export const LONG_MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

/** "may" for the current year, "may 25" for other years. */
export function formatMonthShort(entry: UnpaidMonth, now: Date = new Date()): string {
  const name = SHORT_MONTHS_ES[entry.month - 1] ?? String(entry.month);
  return entry.year === now.getFullYear() ? name : `${name} ${String(entry.year).slice(-2)}`;
}

/** "Mayo 2026" */
export function formatMonthLong(month: number, year: number): string {
  return `${LONG_MONTHS_ES[month - 1] ?? month} ${year}`;
}
