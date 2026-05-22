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

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ message: 'name is required' }, { status: 422 });
  }
  if (name.length > 255) {
    return NextResponse.json({ message: 'name must be 255 characters or fewer' }, { status: 422 });
  }

  const address = typeof body.address === 'string' ? body.address.slice(0, 500) : null;
  const latitude = typeof body.latitude === 'number' ? body.latitude : null;
  const longitude = typeof body.longitude === 'number' ? body.longitude : null;

  try {
    const id = randomUUID();
    const rows = await sql`
      INSERT INTO stores (id, name, address, latitude, longitude, user_id, household_id, created_at, updated_at)
      VALUES (${id}, ${name}, ${address}, ${latitude}, ${longitude}, ${user.userId}, NULL, NOW(), NOW())
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
