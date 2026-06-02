import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 30;

type PaymentRow = {
  id: string;
  name: string;
  user_id: string;
  push_subscription: PushSubscription | null;
};

// GET /api/cron/payments-reminder — called by Vercel Cron
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expired = await sql`
    SELECT mp.id, mp.name, mp.user_id, u.push_subscription
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
  const goneUserIds: string[] = [];

  for (const row of expired) {
    if (!row.push_subscription) continue;
    const result = await sendWebPush(row.push_subscription, {
      title: '💳 Pago pendiente',
      body: `El recordatorio de "${row.name}" que pospusiste ya venció. ¡No olvides pagarlo!`,
      url: '/payments',
    });
    if (result.ok) notified++;
    else if (result.gone) goneUserIds.push(row.user_id);
  }

  if (goneUserIds.length) {
    await sql`UPDATE users SET push_subscription = NULL WHERE id = ANY(${goneUserIds}::uuid[])`;
  }

  await sql`
    UPDATE monthly_payments
    SET snoozed_until = NULL, updated_at = NOW()
    WHERE id = ANY(${ids}::uuid[])
  `;

  return NextResponse.json({ notified, cleared: ids.length });
}
