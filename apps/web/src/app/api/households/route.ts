import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// POST /api/households — create a new household
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as { name?: string };
  const name = (body.name ?? '').trim();
  if (name.length < 2) {
    return NextResponse.json({ message: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 });
  }

  // Check user is not already in a household
  const existing = await sql`SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1`;
  const currentHousehold = (existing[0] as { household_id: string | null } | undefined)?.household_id;
  if (currentHousehold) {
    return NextResponse.json({ message: 'Ya perteneces a un hogar' }, { status: 409 });
  }

  const households = await sql`
    INSERT INTO households (name, owner_id) VALUES (${name}, ${user.userId}) RETURNING id, name, owner_id
  `;
  const household = households[0] as { id: string; name: string; owner_id: string };

  await sql`UPDATE users SET household_id = ${household.id}, updated_at = now() WHERE id = ${user.userId}`;

  return NextResponse.json(
    { id: household.id, name: household.name, ownerId: household.owner_id },
    { status: 201 },
  );
}
