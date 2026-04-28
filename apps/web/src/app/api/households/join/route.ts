import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// POST /api/households/join
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as { code?: string };
  const code = (body.code ?? '').trim().toUpperCase();
  if (code.length < 4) {
    return NextResponse.json({ message: 'Código inválido' }, { status: 400 });
  }

  // Check user is not already in a household
  const existing = await sql`SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1`;
  const currentHousehold = (existing[0] as { household_id: string | null } | undefined)?.household_id;
  if (currentHousehold) {
    return NextResponse.json({ message: 'Ya perteneces a un hogar' }, { status: 409 });
  }

  // Find valid invite
  const invites = await sql`
    SELECT id, household_id FROM household_invites
    WHERE code = ${code}
      AND used_by IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  if (invites.length === 0) {
    return NextResponse.json({ message: 'Código no válido o expirado' }, { status: 404 });
  }

  const invite = invites[0] as { id: string; household_id: string };

  // Mark invite as used and join household
  await sql`
    UPDATE household_invites
    SET used_by = ${user.userId}, used_at = now()
    WHERE id = ${invite.id}
  `;
  await sql`
    UPDATE users SET household_id = ${invite.household_id}, updated_at = now()
    WHERE id = ${user.userId}
  `;

  return NextResponse.json({ householdId: invite.household_id });
}
