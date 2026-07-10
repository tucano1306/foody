import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { mapRecord } from '@/lib/payment-records';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const rows = await sql`
    SELECT id, payment_id, month, year, paid_at, amount, actual_amount,
           payment_method, bank_account, notes, status, created_at
    FROM payment_records
    WHERE payment_id = ${id} AND user_id = ${user.userId}
    ORDER BY year DESC, month DESC
    LIMIT 24
  `;

  return NextResponse.json(
    rows.map((r) => mapRecord(r as Record<string, unknown>)),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Register a paid record for a specific month/year (upsert, like mark-paid). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const paymentRows = await sql`SELECT id, amount FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!paymentRows.length) return notFound();

  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }

  const month = typeof body.month === 'number' ? Math.trunc(body.month) : Number.NaN;
  const year = typeof body.year === 'number' ? Math.trunc(body.year) : Number.NaN;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ message: 'month (1-12) y year válidos son requeridos' }, { status: 422 });
  }

  const defaultAmount = Number.parseFloat(String(paymentRows[0].amount));
  const rawAmount = typeof body.amount === 'number' ? body.amount : Number.parseFloat(String(body.amount ?? ''));
  const actual = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
  const finalAmount = actual ?? defaultAmount;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;

  const rows = await sql`
    INSERT INTO payment_records (
      id, payment_id, month, year, paid_at,
      amount, actual_amount, notes, status, user_id, created_at
    )
    VALUES (
      gen_random_uuid(), ${id}, ${month}, ${year}, NOW(),
      ${finalAmount}, ${actual}, ${notes}, 'paid', ${user.userId}, NOW()
    )
    ON CONFLICT (payment_id, month, year)
    DO UPDATE SET
      status = 'paid',
      paid_at = NOW(),
      amount = EXCLUDED.amount,
      actual_amount = EXCLUDED.actual_amount,
      notes = EXCLUDED.notes
    RETURNING *
  `;

  return NextResponse.json(mapRecord(rows[0] as Record<string, unknown>), { status: 201 });
}
