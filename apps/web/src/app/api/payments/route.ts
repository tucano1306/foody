import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { normalizePaymentMethod, toLast4 } from '@/lib/payment-methods';
import { randomUUID } from 'node:crypto';

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toISOStringSafe(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function daysUntilDue(dueDay: number): number {
  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (dueDay >= today) return dueDay - today;
  return daysInMonth - today + dueDay;
}

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * Count how many past months had the due date pass without a paid record.
 * Starts from the payment's creation month and walks up to (but not including)
 * any month whose due date hasn't passed yet.
 */
function computeMissedMonths(
  createdAt: Date,
  dueDay: number,
  paidKeys: Set<string>, // "YEAR-MONTH" strings
  now: Date,
): number {
  let count = 0;
  const cursor = new Date(createdAt.getFullYear(), createdAt.getMonth(), 1);
  while (true) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const dim = new Date(y, m, 0).getDate();
    const due = new Date(y, m - 1, Math.min(dueDay, dim), 23, 59, 59, 999);
    if (due >= now) break; // due date not yet passed — stop
    if (!paidKeys.has(`${y}-${m}`)) count++;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return count;
}

function mapPayment(
  row: Record<string, unknown>,
  isPaidThisMonth = false,
  missedMonths = 0,
) {
  const dueDay = asInteger(row.due_day, 1);
  const amount = asNumber(row.amount);
  return {
    id: String(row.id),
    name: asText(row.name),
    description: (row.description as string | null | undefined) ?? null,
    amount,
    currency: asText(row.currency, 'MXN'),
    dueDay,
    category: asText(row.category, 'other'),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    notificationDaysBefore: asInteger(row.notification_days_before, 3),
    isVariableAmount: Boolean(row.is_variable_amount),
    isAutoPay: Boolean(row.is_auto_pay),
    paymentMethod: (row.payment_method as string | null | undefined) ?? null,
    bankName: (row.bank_name as string | null | undefined) ?? null,
    accountLast4: (row.account_last4 as string | null | undefined) ?? null,
    userId: String(row.user_id),
    createdAt: toISOStringSafe(row.created_at),
    updatedAt: toISOStringSafe(row.updated_at),
    isPaidThisMonth,
    daysUntilDue: daysUntilDue(dueDay),
    snoozedUntil: row.snoozed_until == null ? null : new Date(row.snoozed_until as string).toISOString(),
    missedMonths,
    accumulatedDebt: missedMonths * amount,
  };
}

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const now = new Date();
  const { month, year } = getCurrentMonthYear();

  const [rows, allRecords] = await Promise.all([
    sql`SELECT * FROM monthly_payments WHERE user_id = ${user.userId} AND is_active = true ORDER BY due_day ASC`,
    // Fetch all paid records for this user to compute accumulated debt
    sql`SELECT payment_id, month, year FROM payment_records WHERE user_id = ${user.userId} AND status = 'paid'`,
  ]);

  // Build a per-payment Set of "YEAR-MONTH" paid keys
  const paidByPayment = new Map<string, Set<string>>();
  for (const rec of allRecords) {
    const pid = String(rec.payment_id);
    if (!paidByPayment.has(pid)) paidByPayment.set(pid, new Set());
    paidByPayment.get(pid)!.add(`${rec.year}-${rec.month}`);
  }

  const currentMonthKey = `${year}-${month}`;

  return NextResponse.json(
    rows.map((row) => {
      const pid = String(row.id);
      const paidKeys = paidByPayment.get(pid) ?? new Set<string>();
      const isPaidThisMonth = paidKeys.has(currentMonthKey);
      const createdAt = new Date(row.created_at as string);
      const missed = computeMissedMonths(createdAt, asInteger(row.due_day, 1), paidKeys, now);
      return mapPayment(row as Record<string, unknown>, isPaidThisMonth, missed);
    }),
  );
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return Number.NaN;
}

function validatePaymentBody(body: Record<string, unknown>): { name: string; amount: number; dueDay: number; notifyDays: number } | { error: string; status: number } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'name is required', status: 422 };
  if (name.length > 255) return { error: 'name must be 255 characters or fewer', status: 422 };

  const amount = parseAmount(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount must be a positive number', status: 422 };

  const dueDay = typeof body.dueDay === 'number' ? Math.trunc(body.dueDay) : 1;
  if (dueDay < 1 || dueDay > 31) return { error: 'dueDay must be between 1 and 31', status: 422 };

  const rawNotify = typeof body.notificationDaysBefore === 'number' ? Math.trunc(body.notificationDaysBefore) : 3;
  const notifyDays = Number.isFinite(rawNotify) && rawNotify >= 0 ? rawNotify : 3;

  return { name, amount, dueDay, notifyDays };
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const validated = validatePaymentBody(body);
  if ('error' in validated) {
    return NextResponse.json({ message: validated.error }, { status: validated.status });
  }
  const { name, amount, dueDay, notifyDays } = validated;

  const paymentMethod = normalizePaymentMethod(body.paymentMethod);
  const bankName =
    typeof body.bankName === 'string' && body.bankName.trim() ? body.bankName.trim().slice(0, 100) : null;
  const accountLast4 =
    typeof body.accountLast4 === 'string' && toLast4(body.accountLast4) ? toLast4(body.accountLast4) : null;

  try {
    const id = randomUUID();
    const rows = await sql`
      INSERT INTO monthly_payments (id, name, description, amount, currency, due_day, category, is_active, notification_days_before, is_variable_amount, is_auto_pay, payment_method, bank_name, account_last4, user_id, created_at, updated_at)
      VALUES (
        ${id},
        ${name},
        ${typeof body.description === 'string' ? body.description.slice(0, 1000) : null},
        ${amount},
        ${typeof body.currency === 'string' ? body.currency : 'MXN'},
        ${dueDay},
        ${typeof body.category === 'string' ? body.category : null},
        true,
        ${notifyDays},
        ${Boolean(body.isVariableAmount)},
        ${Boolean(body.isAutoPay)},
        ${paymentMethod},
        ${bankName},
        ${accountLast4},
        ${user.userId},
        NOW(), NOW()
      ) RETURNING *
    `;
    return NextResponse.json(mapPayment(rows[0] as Record<string, unknown>), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
