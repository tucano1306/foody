import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

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

function daysUntilDue(dueDay: number): number {
  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (dueDay >= today) return dueDay - today;
  return daysInMonth - today + dueDay;
}

function mapPayment(row: Record<string, unknown>) {
  const dueDay = asInteger(row.due_day, 1);
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: (row.description as string | null | undefined) ?? null,
    amount: asNumber(row.amount),
    currency: String(row.currency ?? 'USD'),
    dueDay,
    category: String(row.category ?? 'other'),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    notificationDaysBefore: asInteger(row.notification_days_before, 3),
    userId: String(row.user_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    isPaidThisMonth: false,
    daysUntilDue: daysUntilDue(dueDay),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!rows.length) return notFound();
  return NextResponse.json(mapPayment(rows[0] as Record<string, unknown>));
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json() as Record<string, unknown>;

  const rows = await sql`
    UPDATE monthly_payments SET
      name = COALESCE(${body.name as string ?? null}, name),
      description = COALESCE(${body.description as string ?? null}, description),
      amount = COALESCE(${body.amount as number ?? null}, amount),
      currency = COALESCE(${body.currency as string ?? null}, currency),
      due_day = COALESCE(${body.dueDay as number ?? null}, due_day),
      category = COALESCE(${body.category as string ?? null}, category),
      notification_days_before = COALESCE(${body.notificationDaysBefore as number ?? null}, notification_days_before),
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId} RETURNING *
  `;
  if (!rows.length) return notFound();
  return NextResponse.json(mapPayment(rows[0] as Record<string, unknown>));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const rows = await sql`DELETE FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
