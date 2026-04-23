import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const rows = await sql`
    SELECT * FROM users WHERE id = ${user.userId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as { name?: string; onesignalPlayerId?: string };

  const rows = await sql`
    UPDATE users
    SET
      name = COALESCE(${body.name ?? null}, name),
      onesignal_player_id = COALESCE(${body.onesignalPlayerId ?? null}, onesignal_player_id),
      updated_at = NOW()
    WHERE id = ${user.userId}
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}
