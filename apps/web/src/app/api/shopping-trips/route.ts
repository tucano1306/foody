import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  // Per-user isolation
  const rows = await sql`SELECT * FROM shopping_trips WHERE user_id = ${user.userId} ORDER BY date DESC`;
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
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
      NULL,
      NOW(), NOW()
    ) RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
