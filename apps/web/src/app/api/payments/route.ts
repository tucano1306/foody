import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
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

function mapPayment(row: Record<string, unknown>, isPaidThisMonth = false) {
  const dueDay = asInteger(row.due_day, 1);
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
    userId: String(row.user_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    isPaidThisMonth,
    daysUntilDue: daysUntilDue(dueDay),
  };
}

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const rows = await sql`SELECT * FROM monthly_payments WHERE user_id = ${user.userId} AND is_active = true ORDER BY due_day ASC`;
  const { month, year } = getCurrentMonthYear();
  const records = await sql`SELECT payment_id, status FROM payment_records WHERE user_id = ${user.userId} AND month = ${month} AND year = ${year}`;
  const paidIds = new Set(
    records
      .filter((row) => row.status === 'paid')
      .map((row) => String(row.payment_id)),
  );

  return NextResponse.json(
    rows.map((row) => mapPayment(row as Record<string, unknown>, paidIds.has(String(row.id)))),
  );
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const body = await request.json() as {
    name: string;
    amount: number;
    description?: string;
    currency?: string;
    dueDay?: number;
    category?: string;
    notificationDaysBefore?: number;
  };

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO monthly_payments (id, name, description, amount, currency, due_day, category, is_active, notification_days_before, user_id, created_at, updated_at)
    VALUES (
      ${id},
      ${body.name},
      ${body.description ?? null},
      ${body.amount},
      ${body.currency ?? 'USD'},
      ${body.dueDay ?? 1},
      ${body.category ?? null},
      true,
      ${body.notificationDaysBefore ?? 3},
      ${user.userId},
      NOW(), NOW()
    ) RETURNING *
  `;
  return NextResponse.json(mapPayment(rows[0] as Record<string, unknown>), { status: 201 });
}
