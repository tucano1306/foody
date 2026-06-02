import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';

const ALLOWED_METHODS = new Set(['transfer', 'debit_card', 'credit_card', 'cash', 'bank_account', 'other']);

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const paymentRows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!paymentRows.length) return notFound();

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    body = {};
  }

  const payment = paymentRows[0];
  const defaultAmount = Number.parseFloat(String(payment.amount));
  const actual = parseAmount(body.amount);
  const finalAmount = actual ?? defaultAmount;

  const rawMethod = parseString(body.paymentMethod, 20);
  const method = rawMethod && ALLOWED_METHODS.has(rawMethod) ? rawMethod : null;
  const bankAccount = parseString(body.bankAccount, 100);
  const notes = parseString(body.notes, 500);

  const { month, year } = getCurrentMonthYear();
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

  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const { month, year } = getCurrentMonthYear();
  await sql`DELETE FROM payment_records WHERE payment_id = ${id} AND user_id = ${user.userId} AND month = ${month} AND year = ${year}`;
  return new NextResponse(null, { status: 204 });
}