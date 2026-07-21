import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// DELETE /api/households/leave
export async function DELETE(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const userRows = await sql`SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1`;
  const householdId = (userRows[0] as { household_id: string | null } | undefined)?.household_id;

  if (!householdId) {
    return new NextResponse(null, { status: 204 });
  }

  // Check if user is the owner — if so, dissolve the entire household.
  // ON DELETE CASCADE removes household_invites; ON DELETE SET NULL clears all members' household_id.
  const householdRows = await sql`SELECT owner_id FROM households WHERE id = ${householdId} LIMIT 1`;
  const isOwner = (householdRows[0] as { owner_id: string } | undefined)?.owner_id === user.userId;

  if (isOwner) {
    await sql`DELETE FROM households WHERE id = ${householdId}`;
  } else {
    await sql`UPDATE users SET household_id = NULL, updated_at = now() WHERE id = ${user.userId}`;
    // Stop sharing my pantry with a household I no longer belong to: detach my
    // products from its namespace so remaining members can't see them anymore.
    await sql`UPDATE products SET household_id = NULL, updated_at = now() WHERE user_id = ${user.userId} AND household_id = ${householdId}`;
  }

  return new NextResponse(null, { status: 204 });
}
