import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';

function getCurrentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const paymentRows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!paymentRows.length) return notFound();

  const { month, year } = getCurrentMonthYear();
  const payment = paymentRows[0];
  const rows = await sql`
    INSERT INTO payment_records (id, payment_id, month, year, paid_at, amount, status, user_id, created_at)
    VALUES (gen_random_uuid(), ${id}, ${month}, ${year}, NOW(), ${payment.amount}, 'paid', ${user.userId}, NOW())
    ON CONFLICT (payment_id, month, year)
    DO UPDATE SET status = 'paid', paid_at = NOW(), amount = EXCLUDED.amount
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