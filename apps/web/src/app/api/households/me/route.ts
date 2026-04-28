import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// GET /api/households/me
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const userRows = await sql`
    SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1
  `;
  const householdId = (userRows[0] as { household_id: string | null } | undefined)?.household_id ?? null;

  if (!householdId) {
    return NextResponse.json({ household: null, members: [], isOwner: false });
  }

  const householdRows = await sql`
    SELECT id, name, owner_id FROM households WHERE id = ${householdId} LIMIT 1
  `;
  if (householdRows.length === 0) {
    return NextResponse.json({ household: null, members: [], isOwner: false });
  }

  const household = householdRows[0] as { id: string; name: string; owner_id: string };

  const memberRows = await sql`
    SELECT id, name, email, avatar_url FROM users WHERE household_id = ${householdId} ORDER BY created_at ASC
  `;

  const members = (memberRows as { id: string; name: string | null; email: string; avatar_url: string | null }[]).map(
    (m) => ({ id: m.id, name: m.name, email: m.email, avatarUrl: m.avatar_url }),
  );

  return NextResponse.json({
    household: { id: household.id, name: household.name, ownerId: household.owner_id },
    members,
    isOwner: household.owner_id === user.userId,
  });
}
