import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

// GET /api/stores
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  // Per-user isolation
  const rows = await sql`SELECT * FROM stores WHERE user_id = ${user.userId} ORDER BY name ASC`;
  return NextResponse.json(rows);
}

// POST /api/stores
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const body = await request.json() as { name: string; address?: string; latitude?: number; longitude?: number };

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO stores (id, name, address, latitude, longitude, user_id, household_id, created_at, updated_at)
    VALUES (${id}, ${body.name}, ${body.address ?? null}, ${body.latitude ?? null}, ${body.longitude ?? null}, ${user.userId}, NULL, NOW(), NOW())
    RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
