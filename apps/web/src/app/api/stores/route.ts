import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

// GET /api/stores
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);

  let rows;
  if (householdId) {
    rows = await sql`SELECT * FROM stores WHERE household_id = ${householdId} ORDER BY name ASC`;
  } else {
    rows = await sql`SELECT * FROM stores WHERE user_id = ${user.userId} AND household_id IS NULL ORDER BY name ASC`;
  }
  return NextResponse.json(rows);
}

// POST /api/stores
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);
  const body = await request.json() as { name: string; address?: string; latitude?: number; longitude?: number };

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO stores (id, name, address, latitude, longitude, user_id, household_id, created_at, updated_at)
    VALUES (${id}, ${body.name}, ${body.address ?? null}, ${body.latitude ?? null}, ${body.longitude ?? null}, ${user.userId}, ${householdId}, NOW(), NOW())
    RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
