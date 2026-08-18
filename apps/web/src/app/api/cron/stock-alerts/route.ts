import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ensureStockSignalSchema } from '@/lib/ensure-schema';
import { sendWebPush } from '@/lib/web-push';
import {
  forecastMessage,
  forecastStock,
  MIN_PURCHASE_DAYS,
  type ForecastReason,
  type StockLevel,
} from '@/lib/stock-forecast';
import type { PushSubscription } from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Row = {
  product_id: string;
  product_name: string;
  stock_level: StockLevel;
  user_id: string;
  user_name: string | null;
  push_subscription: PushSubscription | null;
  avg_interval_days: number | null;
  purchase_days: number;
  last_purchased_at: string | null;
  stock_updated_at: string | null;
  last_stock_alert_at: string | null;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/cron/stock-alerts — «se te está acabando X», una vez por ciclo.
 *
 * Toda la decisión vive en `stock-forecast.ts` (puro y probado); aquí solo se
 * leen los datos, se envía y se sella el aviso para no repetirlo mañana.
 *
 * El promedio se calcula sobre DÍAS DISTINTOS de compra, no sobre filas: dos
 * tickets del mismo súper el mismo día daban un «ciclo» de 0,9 días y con eso
 * cualquier producto queda agotado al día siguiente para siempre.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureStockSignalSchema();

  const rows = await sql`
    WITH purchase_days AS (
      -- Un día de compra es un DÍA, aunque ese día hubiera tres tickets.
      SELECT product_id, DATE(purchased_at) AS day
      FROM product_purchases
      GROUP BY product_id, DATE(purchased_at)
    ),
    stats AS (
      SELECT
        product_id,
        COUNT(*) AS purchase_days,
        -- Restar dos DATE ya da días enteros: meterlo en EXTRACT(EPOCH …)
        -- —que espera un interval— revienta con «function extract(unknown,
        -- integer) does not exist», y el cron entero se caía cada mañana.
        (MAX(day) - MIN(day))::numeric / NULLIF(COUNT(*) - 1, 0) AS avg_interval_days,
        MAX(day) AS last_purchased_at
      FROM purchase_days
      GROUP BY product_id
      HAVING COUNT(*) >= ${MIN_PURCHASE_DAYS}
    )
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.stock_level,
      p.user_id,
      p.stock_updated_at,
      p.last_stock_alert_at,
      u.name AS user_name,
      u.push_subscription,
      s.avg_interval_days,
      s.purchase_days,
      s.last_purchased_at
    FROM products p
    JOIN users u ON u.id = p.user_id
    JOIN stats s ON s.product_id = p.id
    WHERE u.push_subscription IS NOT NULL
  ` as Row[];

  let sent = 0;
  const skippedBy: Partial<Record<ForecastReason, number>> = {};
  const goneUserIds: string[] = [];
  const alertedProductIds: string[] = [];
  const now = new Date();

  for (const row of rows) {
    const lastPurchasedAt = toDate(row.last_purchased_at);
    if (!lastPurchasedAt || !row.push_subscription) {
      skippedBy['no-history'] = (skippedBy['no-history'] ?? 0) + 1;
      continue;
    }

    const avg = row.avg_interval_days === null ? null : Number(row.avg_interval_days);
    const forecast = forecastStock({
      stockLevel: row.stock_level,
      avgIntervalDays: avg,
      purchaseDays: Number(row.purchase_days),
      lastPurchasedAt,
      stockUpdatedAt: toDate(row.stock_updated_at),
      lastAlertAt: toDate(row.last_stock_alert_at),
      now,
    });

    if (!forecast.shouldAlert) {
      skippedBy[forecast.reason] = (skippedBy[forecast.reason] ?? 0) + 1;
      continue;
    }

    const result = await sendWebPush(row.push_subscription, {
      title: '🥑 Foody — Se te acaba',
      body: forecastMessage(row.user_name, row.product_name, forecast, avg ?? 0),
      url: '/shopping-trips',
      data: { type: 'stock_alert', productId: row.product_id, daysRemaining: forecast.daysRemaining },
    });

    if (result.ok) {
      sent++;
      // Se sella SIEMPRE que el envío salió bien: es lo que impide que el mismo
      // aviso vuelva mañana, y era justo lo que faltaba.
      alertedProductIds.push(row.product_id);
    } else if (result.gone) {
      goneUserIds.push(row.user_id);
    }
  }

  if (alertedProductIds.length) {
    await sql`
      UPDATE products SET last_stock_alert_at = NOW()
      WHERE id = ANY(${alertedProductIds}::uuid[])
    `;
  }
  if (goneUserIds.length) {
    await sql`UPDATE users SET push_subscription = NULL WHERE id = ANY(${goneUserIds}::uuid[])`;
  }

  return NextResponse.json({ checked: rows.length, sent, skipped: skippedBy });
}
