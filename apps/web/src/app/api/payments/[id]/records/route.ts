import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

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

  const records = rows.map((r) => ({
    id: String(r.id),
    paymentId: String(r.payment_id),
    month: Number(r.month),
    year: Number(r.year),
    paidAt: r.paid_at ? new Date(r.paid_at as string).toISOString() : null,
    amount: Number.parseFloat(String(r.amount)),
    actualAmount: r.actual_amount == null ? null : Number.parseFloat(String(r.actual_amount)),
    paymentMethod: (r.payment_method as string | null) ?? null,
    bankAccount: (r.bank_account as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    status: String(r.status),
    createdAt: new Date(r.created_at as string).toISOString(),
  }));

  return NextResponse.json(records);
}
