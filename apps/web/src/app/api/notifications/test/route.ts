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
      const vapidMissing = result.error === 'VAPID not configured';
      let friendly: string;
      if (vapidMissing) {
        friendly = 'Servidor sin VAPID configurado. Falta variable de entorno.';
      } else if (result.gone) {
        await sql`UPDATE users SET push_subscription = NULL WHERE id = ${user.userId}`;
        friendly = result.statusCode === 403
          ? 'Tu suscripción ya no es válida (clave VAPID cambió). Desactiva y vuelve a activar las notificaciones.'
          : 'Tu suscripción expiró. Vuelve a activar las notificaciones.';
      } else {
        friendly = `Error del servicio push (${result.statusCode ?? '?'}): ${result.error ?? 'desconocido'}`;
      }
      console.error('[notifications/test] failed:', {
        statusCode: result.statusCode,
        error: result.error,
        gone: result.gone,
      });
      return NextResponse.json(
        { sent: false, error: friendly, statusCode: result.statusCode, gone: result.gone },
        { status: result.gone ? 410 : 502 },
      );
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
