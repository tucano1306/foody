import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// DELETE /api/households/leave
export async function DELETE(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  await sql`
    UPDATE users SET household_id = NULL, updated_at = now()
    WHERE id = ${user.userId}
  `;

  return new NextResponse(null, { status: 204 });
}
