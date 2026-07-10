import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { methodNeedsBank, normalizePaymentMethod, toLast4 } from '@/lib/payment-methods';
import { daysUntilNextDue, nextDueDate } from '@/lib/payment-cycle';
import { buildPaymentAggregates, EMPTY_AGGREGATES, type PaymentAggregates } from '@/lib/payment-aggregates';

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

function mapPayment(row: Record<string, unknown>, aggregates: PaymentAggregates = EMPTY_AGGREGATES) {
  const dueDay = asInteger(row.due_day, 1);
  const isPaidThisMonth = aggregates.isPaidThisMonth;
  return {
    id: String(row.id),
    name: asText(row.name),
    description: (row.description as string | null | undefined) ?? null,
    amount: asNumber(row.amount),
    currency: asText(row.currency, 'USD'),
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
    // Cycle-aware: once paid this month, the countdown targets next month's due day.
    daysUntilDue: daysUntilNextDue(dueDay, isPaidThisMonth),
    nextDueDate: nextDueDate(dueDay, isPaidThisMonth).toISOString(),
    snoozedUntil: row.snoozed_until == null ? null : new Date(row.snoozed_until as string).toISOString(),
    missedMonths: aggregates.missedMonths,
    accumulatedDebt: aggregates.accumulatedDebt,
    unpaidMonths: aggregates.unpaidMonths,
    totalPaidAllTime: aggregates.totalPaidAllTime,
    paidCountAllTime: aggregates.paidCountAllTime,
    lastPaidAt: aggregates.lastPaidAt,
  };
}

/** Aggregates (debt + all-time totals) for a single payment. */
async function loadAggregates(row: Record<string, unknown>, userId: string): Promise<PaymentAggregates> {
  const paidRows = await sql`
    SELECT month, year, amount, actual_amount, paid_at
    FROM payment_records
    WHERE payment_id = ${String(row.id)} AND user_id = ${userId} AND status = 'paid'
  `;
  return buildPaymentAggregates({
    createdAt: new Date(row.created_at as string),
    dueDay: asInteger(row.due_day, 1),
    amount: asNumber(row.amount),
    paidRecords: paidRows.map((r) => ({
      month: asInteger(r.month),
      year: asInteger(r.year),
      amount: asNumber(r.amount),
      actualAmount: r.actual_amount == null ? null : asNumber(r.actual_amount),
      paidAt: r.paid_at == null ? null : toISOStringSafe(r.paid_at),
    })),
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!rows.length) return notFound();

  const row = rows[0] as Record<string, unknown>;
  return NextResponse.json(mapPayment(row, await loadAggregates(row, user.userId)));
}

function validatePatchName(body: Record<string, unknown>): string | null {
  if (body.name === undefined) return null;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  return name || null;
}

function parsePatchAmount(body: Record<string, unknown>): number | null {
  if (body.amount === undefined) return null;
  if (typeof body.amount === 'number') return body.amount;
  if (typeof body.amount === 'string') return Number.parseFloat(body.amount);
  return null;
}

function validatePatchBody(body: Record<string, unknown>): { validated: Record<string, unknown> } | { error: string; status: number } {
  let result = { ...body };
  if (body.name !== undefined) {
    const name = validatePatchName(body);
    if (!name) return { error: 'name cannot be empty', status: 422 };
    if (name.length > 255) return { error: 'name must be 255 characters or fewer', status: 422 };
    result = { ...result, name };
  }
  if (body.amount !== undefined) {
    const amount = parsePatchAmount(body);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return { error: 'amount must be a positive number', status: 422 };
    }
    result = { ...result, amount };
  }
  return { validated: result };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const check = validatePatchBody(rawBody);
  if ('error' in check) return NextResponse.json({ message: check.error }, { status: check.status });
  const body = check.validated;

  // When the payment method is being edited, set method + bank + last4 together
  // (switching to e.g. cash must also clear any stored bank/card details).
  const methodProvided = body.paymentMethod !== undefined;
  const newMethod = normalizePaymentMethod(body.paymentMethod);
  const keepBank = methodNeedsBank(newMethod);
  const newBankName =
    keepBank && typeof body.bankName === 'string' && body.bankName.trim()
      ? body.bankName.trim().slice(0, 100)
      : null;
  const newLast4 =
    keepBank && typeof body.accountLast4 === 'string' && toLast4(body.accountLast4)
      ? toLast4(body.accountLast4)
      : null;

  try {
    const rows = await sql`
      UPDATE monthly_payments SET
        name = COALESCE(${body.name as string ?? null}, name),
        description = COALESCE(${body.description as string ?? null}, description),
        amount = COALESCE(${body.amount as number ?? null}, amount),
        currency = COALESCE(${body.currency as string ?? null}, currency),
        due_day = COALESCE(${body.dueDay as number ?? null}, due_day),
        category = COALESCE(${body.category as string ?? null}, category),
        notification_days_before = COALESCE(${body.notificationDaysBefore as number ?? null}, notification_days_before),
        is_variable_amount = COALESCE(${body.isVariableAmount === undefined ? null : Boolean(body.isVariableAmount)}, is_variable_amount),
        is_auto_pay = COALESCE(${body.isAutoPay === undefined ? null : Boolean(body.isAutoPay)}, is_auto_pay),
        payment_method = CASE WHEN ${methodProvided} THEN ${newMethod} ELSE payment_method END,
        bank_name = CASE WHEN ${methodProvided} THEN ${newBankName} ELSE bank_name END,
        account_last4 = CASE WHEN ${methodProvided} THEN ${newLast4} ELSE account_last4 END,
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId} RETURNING *
    `;
    if (!rows.length) return notFound();
    const row = rows[0] as Record<string, unknown>;
    return NextResponse.json(mapPayment(row, await loadAggregates(row, user.userId)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const rows = await sql`DELETE FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
