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
    rows = await sql`SELECT * FROM shopping_trips WHERE household_id = ${householdId} ORDER BY date DESC`;
  } else {
    rows = await sql`SELECT * FROM shopping_trips WHERE user_id = ${user.userId} AND household_id IS NULL ORDER BY date DESC`;
  }
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);
  const body = await request.json() as { storeId?: string; storeName?: string; date?: string; totalSpent?: number; currency?: string; notes?: string };

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO shopping_trips (id, store_id, store_name, date, total_spent, currency, notes, user_id, household_id, created_at, updated_at)
    VALUES (
      ${id},
      ${body.storeId ?? null},
      ${body.storeName ?? null},
      ${body.date ?? new Date().toISOString()},
      ${body.totalSpent ?? 0},
      ${body.currency ?? 'MXN'},
      ${body.notes ?? null},
      ${user.userId},
      ${householdId},
      NOW(), NOW()
    ) RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
