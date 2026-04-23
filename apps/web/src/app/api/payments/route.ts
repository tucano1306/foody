import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);

  let rows;
  if (householdId) {
    rows = await sql`SELECT * FROM payments WHERE household_id = ${householdId} ORDER BY due_date DESC`;
  } else {
    rows = await sql`SELECT * FROM payments WHERE user_id = ${user.userId} AND household_id IS NULL ORDER BY due_date DESC`;
  }
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);
  const body = await request.json() as {
    name: string;
    amount: number;
    currency?: string;
    dueDate?: string;
    category?: string;
    isPaid?: boolean;
    notes?: string;
    isRecurring?: boolean;
  };

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO payments (id, name, amount, currency, due_date, category, is_paid, notes, is_recurring, user_id, household_id, created_at, updated_at)
    VALUES (
      ${id},
      ${body.name},
      ${body.amount},
      ${body.currency ?? 'MXN'},
      ${body.dueDate ?? null},
      ${body.category ?? null},
      ${body.isPaid ?? false},
      ${body.notes ?? null},
      ${body.isRecurring ?? false},
      ${user.userId},
      ${householdId},
      NOW(), NOW()
    ) RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
