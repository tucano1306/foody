import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Row = {
  product_id: string;
  product_name: string;
  stock_level: 'full' | 'half' | 'empty';
  user_id: string;
  user_name: string | null;
  push_subscription: PushSubscription | null;
  avg_interval_days: number | null;
  last_purchased_at: string | null;
};

function stockFraction(level: Row['stock_level']): number {
  if (level === 'full') return 1;
  if (level === 'half') return 0.5;
  return 0.1;
}

function buildBody(name: string | null, productName: string, daysRemaining: number, cycle: number): string {
  const firstName = name?.split(' ')[0] ?? null;
  const greeting = firstName ? `Hola ${firstName}, ` : '¡Hola! ';
  if (daysRemaining <= 0) {
    return `${greeting}parece que ${productName} ya se agotó. ¡Te lo agregamos a la lista del súper! 🛒`;
  }
  if (daysRemaining === 1) {
    return `${greeting}basándonos en tu consumo habitual, ${productName} te durará solo 1 día más. ¿Lo agregamos a la lista? 🛒`;
  }
  return `${greeting}según tus patrones de compra (cada ~${cycle} días), ${productName} te durará unos ${daysRemaining} días más. ¡Buen momento para reponerlo! 🛒`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // For each product with ≥2 purchases, compute avg interval (days) and last purchase.
  const rows = await sql`
    WITH stats AS (
      SELECT
        product_id,
        COUNT(*) AS purchase_count,
        EXTRACT(EPOCH FROM (MAX(purchased_at) - MIN(purchased_at))) / 86400.0
          / NULLIF(COUNT(*) - 1, 0) AS avg_interval_days,
        MAX(purchased_at) AS last_purchased_at
      FROM product_purchases
      GROUP BY product_id
      HAVING COUNT(*) >= 2
    )
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.stock_level,
      p.user_id,
      u.name AS user_name,
      u.push_subscription,
      s.avg_interval_days,
      s.last_purchased_at
    FROM products p
    JOIN users u ON u.id = p.user_id
    JOIN stats s ON s.product_id = p.id
    WHERE u.push_subscription IS NOT NULL
  ` as Row[];

  let sent = 0;
  let skipped = 0;
  const goneUserIds: string[] = [];

  for (const row of rows) {
    if (!row.avg_interval_days || !row.last_purchased_at || !row.push_subscription) {
      skipped++;
      continue;
    }
    const avg = row.avg_interval_days;
    const fraction = stockFraction(row.stock_level);
    const totalCycleMs = avg * 86_400_000;
    const elapsedMs = Date.now() - new Date(row.last_purchased_at).getTime();
    const remainingMs = totalCycleMs * fraction - elapsedMs;
    const daysRemaining = Math.round(remainingMs / 86_400_000);

    const threshold = Math.max(3, Math.round(avg * 0.25));
    if (daysRemaining > threshold) {
      skipped++;
      continue;
    }

    // Dedupe: if last purchase happened within 75% of cycle, assume we already alerted.
    const cycleStart = Date.now() - avg * 0.75 * 86_400_000;
    if (new Date(row.last_purchased_at).getTime() >= cycleStart && row.stock_level === 'full') {
      skipped++;
      continue;
    }

    const body = buildBody(row.user_name, row.product_name, daysRemaining, Math.round(avg));
    const result = await sendWebPush(row.push_subscription, {
      title: '🥑 Foody — Se te acaba',
      body,
      url: '/shopping-trips',
      data: { type: 'stock_alert', productId: row.product_id, daysRemaining },
    });
    if (result.ok) sent++;
    else if (result.gone) goneUserIds.push(row.user_id);
  }

  if (goneUserIds.length) {
    await sql`UPDATE users SET push_subscription = NULL WHERE id = ANY(${goneUserIds}::uuid[])`;
  }

  return NextResponse.json({ checked: rows.length, sent, skipped });
}
