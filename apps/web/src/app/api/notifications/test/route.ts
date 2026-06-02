import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { sql } from '@/lib/db';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getRouteUser(request);
    if (!user) return unauthorized();

    const rows = await sql`
      SELECT push_subscription FROM users WHERE id = ${user.userId} LIMIT 1
    `;
    const subscription = rows[0]?.push_subscription as PushSubscription | null | undefined;

    if (!subscription) {
      return NextResponse.json(
        { sent: false, error: 'Sin suscripción push. Acepta permisos primero.' },
        { status: 400 },
      );
    }

    const result = await sendWebPush(subscription, {
      title: '🥑 Foody',
      body: '¡Las notificaciones push están funcionando correctamente!',
      url: '/home',
    });

    if (!result.ok) {
      if (result.gone) {
        await sql`UPDATE users SET push_subscription = NULL WHERE id = ${user.userId}`;
      }
      return NextResponse.json({ sent: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('[notifications/test] crash:', err);
    return NextResponse.json(
      { sent: false, error: (err as Error).message ?? 'unknown' },
      { status: 500 },
    );
  }
}
