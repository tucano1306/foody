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

function mapPayment(row: Record<string, unknown>) {
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
    isPaidThisMonth: false,
    daysUntilDue: daysUntilDue(dueDay),
  };
}

function getCurrentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT * FROM monthly_payments WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!rows.length) return notFound();

  const { month, year } = getCurrentMonthYear();
  const records = await sql`SELECT status FROM payment_records WHERE payment_id = ${id} AND user_id = ${user.userId} AND month = ${month} AND year = ${year} LIMIT 1`;
  const isPaidThisMonth = records[0]?.status === 'paid';

  const payment = mapPayment(rows[0] as Record<string, unknown>);
  return NextResponse.json({ ...payment, isPaidThisMonth });
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate name if provided
  if (body.name !== undefined) {
    const name = validatePatchName(body);
    if (!name) return NextResponse.json({ message: 'name cannot be empty' }, { status: 422 });
    if (name.length > 255) return NextResponse.json({ message: 'name must be 255 characters or fewer' }, { status: 422 });
    body = { ...body, name };
  }

  // Validate amount if provided
  if (body.amount !== undefined) {
    const amount = parsePatchAmount(body);
    if (amount === null || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ message: 'amount must be a positive number' }, { status: 422 });
    }
    body = { ...body, amount };
  }

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
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId} RETURNING *
    `;
    if (!rows.length) return notFound();
    return NextResponse.json(mapPayment(rows[0] as Record<string, unknown>));
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
