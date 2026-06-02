import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const rows = await sql`
    SELECT id, name, email, avatar_url, household_id, created_at, updated_at
    FROM users WHERE id = ${user.userId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as {
    name?: string;
    pushSubscription?: PushSubscriptionJSON | null;
  };

  const pushSubJson = body.pushSubscription === undefined ? null : JSON.stringify(body.pushSubscription);

  const rows = await sql`
    UPDATE users
    SET
      name = COALESCE(${body.name ?? null}, name),
      push_subscription = COALESCE(${pushSubJson}::jsonb, push_subscription),
      updated_at = NOW()
    WHERE id = ${user.userId}
    RETURNING id, name, email, avatar_url, household_id, created_at, updated_at
  `;
  return NextResponse.json(rows[0]);
}

interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}
