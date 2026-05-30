import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 30;

type PaymentRow = {
  id: string;
  name: string;
  user_id: string;
  onesignal_player_id: string | null;
};

async function sendPushNotification(playerId: string, paymentName: string): Promise<boolean> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) return false;

  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: [playerId],
      headings: { en: '💳 Pago pendiente', es: '💳 Pago pendiente' },
      contents: {
        en: `El recordatorio de "${paymentName}" que pospusiste ya venció. ¡No olvides pagarlo!`,
        es: `El recordatorio de "${paymentName}" que pospusiste ya venció. ¡No olvides pagarlo!`,
      },
      url: 'https://foody-web-eight.vercel.app/payments',
    }),
  });

  return res.ok;
}

// GET /api/cron/payments-reminder — called by Vercel Cron
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify this is a legitimate Vercel Cron call
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find all payments whose snooze has expired
  const expired = await sql`
    SELECT mp.id, mp.name, mp.user_id, u.onesignal_player_id
    FROM monthly_payments mp
    JOIN users u ON u.id = mp.user_id
    WHERE mp.snoozed_until IS NOT NULL
      AND mp.snoozed_until <= NOW()
      AND mp.is_active = true
  ` as PaymentRow[];

  if (!expired.length) {
    return NextResponse.json({ notified: 0, cleared: 0 });
  }

  let notified = 0;
  const ids = expired.map((r) => r.id);

  for (const row of expired) {
    if (row.onesignal_player_id) {
      const ok = await sendPushNotification(row.onesignal_player_id, row.name);
      if (ok) notified++;
    }
  }

  // Clear snoozed_until for all expired payments regardless of notification success
  await sql`
    UPDATE monthly_payments
    SET snoozed_until = NULL, updated_at = NOW()
    WHERE id = ANY(${ids}::uuid[])
  `;

  return NextResponse.json({ notified, cleared: ids.length });
}
