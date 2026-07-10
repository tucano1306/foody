import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { listUnpaidMonths, monthKey } from '@/lib/payment-aggregates';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

const ALLOWED_METHODS = new Set(['transfer', 'debit_card', 'credit_card', 'cash', 'bank_account', 'other']);

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function parseString(value: unknown, max = 100): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * The month a new payment settles: the oldest unpaid month whose due date
 * already passed, falling back to the current month when there is no debt.
 */
function findTargetMonth(
  createdAt: Date,
  dueDay: number,
  paidKeys: Set<string>,
  now: Date,
): { month: number; year: number } {
  const unpaid = listUnpaidMonths(createdAt, dueDay, paidKeys, now);
  return unpaid[0] ?? { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const now = new Date();

  const [paymentRows, allRecords] = await Promise.all([
    sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`,
    sql`SELECT month, year FROM payment_records WHERE payment_id = ${id} AND user_id = ${user.userId} AND status = 'paid'`,
  ]);
  if (!paymentRows.length) return notFound();

  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }

  const payment = paymentRows[0];
  const defaultAmount = Number.parseFloat(String(payment.amount));
  const actual = parseAmount(body.amount);
  const finalAmount = actual ?? defaultAmount;

  const rawMethod = parseString(body.paymentMethod, 20);
  const method = rawMethod && ALLOWED_METHODS.has(rawMethod) ? rawMethod : null;
  const bankAccount = parseString(body.bankAccount, 100);
  const notes = parseString(body.notes, 500);

  // Determine which month to record: oldest unpaid first
  const paidKeys = new Set(allRecords.map((r) => monthKey(Number(r.year), Number(r.month))));
  const createdAt = new Date(payment.created_at as string);
  const { month, year } = findTargetMonth(createdAt, Number(payment.due_day), paidKeys, now);

  const rows = await sql`
    INSERT INTO payment_records (
      id, payment_id, month, year, paid_at,
      amount, actual_amount, payment_method, bank_account, notes,
      status, user_id, created_at
    )
    VALUES (
      gen_random_uuid(), ${id}, ${month}, ${year}, NOW(),
      ${finalAmount}, ${actual}, ${method}, ${bankAccount}, ${notes},
      'paid', ${user.userId}, NOW()
    )
    ON CONFLICT (payment_id, month, year)
    DO UPDATE SET
      status = 'paid',
      paid_at = NOW(),
      amount = EXCLUDED.amount,
      actual_amount = EXCLUDED.actual_amount,
      payment_method = EXCLUDED.payment_method,
      bank_account = EXCLUDED.bank_account,
      notes = EXCLUDED.notes
    RETURNING *
  `;

  // Push notification: payment marked as paid
  const subRows = await sql`SELECT push_subscription FROM users WHERE id = ${user.userId} LIMIT 1`;
  const sub = subRows[0]?.push_subscription as PushSubscription | null | undefined;
  if (sub?.endpoint) {
    const name = String(payment.name ?? '');
    const currency = String(payment.currency ?? 'USD');
    const displayAmount = finalAmount.toFixed(2);
    await sendWebPush(sub, {
      title: '✅ Pago registrado',
      body: `${name} (${currency} ${displayAmount}) marcado como pagado.`,
      url: `/payments?payment=${id}`,
      data: { type: 'payment_paid', paymentId: id },
    });
  }

  return NextResponse.json({ ...rows[0], targetMonth: month, targetYear: year, paidAmount: finalAmount });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const removed = await sql`
    DELETE FROM payment_records
    WHERE payment_id = ${id} AND user_id = ${user.userId} AND month = ${month} AND year = ${year}
    RETURNING amount, actual_amount
  `;
  const rec = removed[0] as { amount: unknown; actual_amount: unknown } | undefined;
  const amount = rec
    ? Number.parseFloat(String(rec.actual_amount ?? rec.amount)) || 0
    : 0;
  return NextResponse.json({ removed: removed.length > 0, amount });
}