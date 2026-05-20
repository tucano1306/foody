import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { sql } from '@/lib/db';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) {
    return NextResponse.json({ sent: false, error: 'OneSignal not configured' }, { status: 500 });
  }

  const rows = await sql`
    SELECT onesignal_player_id FROM users WHERE id = ${user.userId} LIMIT 1
  `;
  const playerId = rows[0]?.onesignal_player_id as string | null | undefined;

  if (!playerId) {
    return NextResponse.json({ sent: false, error: 'No player ID — accept push permissions first' });
  }

  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: [playerId],
      headings: { en: '🥑 Foody', es: '🥑 Foody' },
      contents: {
        en: '¡Las notificaciones push están funcionando correctamente!',
        es: '¡Las notificaciones push están funcionando correctamente!',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ sent: false, error: body }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
