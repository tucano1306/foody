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

function mapPayment(row: Record<string, unknown>, isPaidThisMonth = false) {
  const dueDay = asInteger(row.due_day, 1);
  return {
    id: String(row.id),
    name: asText(row.name),
    description: (row.description as string | null | undefined) ?? null,
    amount: asNumber(row.amount),
    currency: asText(row.currency, 'MXN'),
    dueDay,
    category: asText(row.category, 'other'),
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    notificationDaysBefore: asInteger(row.notification_days_before, 3),
    isVariableAmount: Boolean(row.is_variable_amount),
    userId: String(row.user_id),
    createdAt: toISOStringSafe(row.created_at),
    updatedAt: toISOStringSafe(row.updated_at),
    isPaidThisMonth,
    daysUntilDue: daysUntilDue(dueDay),
    snoozedUntil: row.snoozed_until == null ? null : new Date(row.snoozed_until as string).toISOString(),
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

  try {
    const id = randomUUID();
    const rows = await sql`
      INSERT INTO monthly_payments (id, name, description, amount, currency, due_day, category, is_active, notification_days_before, is_variable_amount, user_id, created_at, updated_at)
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
