import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

let schemaReady = false;

async function ensureBudgetSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS budget_settings (
      id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      monthly_limit DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency    VARCHAR(10)   NOT NULL DEFAULT 'MXN',
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
      UNIQUE (user_id)
    )
  `;
  schemaReady = true;
}

// GET /api/budget
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  await ensureBudgetSchema();

  const [settingsRows, currentRows, historyRows, avgRows] = await Promise.all([
    sql`
      SELECT monthly_limit, currency FROM budget_settings
      WHERE user_id = ${user.userId}
      LIMIT 1
    `,
    sql`
      SELECT COALESCE(SUM(COALESCE(total_price, unit_price * quantity, 0)), 0) AS total
      FROM product_purchases
      WHERE user_id = ${user.userId}
        AND purchased_at >= DATE_TRUNC('month', NOW())
    `,
    sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', purchased_at), 'YYYY-MM') AS month,
        COALESCE(SUM(COALESCE(total_price, unit_price * quantity, 0)), 0) AS total,
        COUNT(*) AS trips
      FROM product_purchases
      WHERE user_id = ${user.userId}
        AND purchased_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
        AND purchased_at < DATE_TRUNC('month', NOW())
      GROUP BY DATE_TRUNC('month', purchased_at)
      ORDER BY month ASC
    `,
    sql`
      SELECT COALESCE(AVG(monthly_total), 0) AS avg_monthly
      FROM (
        SELECT SUM(COALESCE(total_price, unit_price * quantity, 0)) AS monthly_total
        FROM product_purchases
        WHERE user_id = ${user.userId}
          AND purchased_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
          AND purchased_at < DATE_TRUNC('month', NOW())
        GROUP BY DATE_TRUNC('month', purchased_at)
      ) sub
    `,
  ]);

  const monthlyLimit = settingsRows.length > 0
    ? Number.parseFloat((settingsRows[0] as { monthly_limit: string }).monthly_limit)
    : 0;
  const spentThisMonth = Number.parseFloat((currentRows[0] as { total: string }).total ?? '0');
  const avgMonthly = Number.parseFloat((avgRows[0] as { avg_monthly: string }).avg_monthly ?? '0');

  const percentUsed = monthlyLimit > 0 ? Math.min(200, (spentThisMonth / monthlyLimit) * 100) : null;
  const remaining = monthlyLimit > 0 ? monthlyLimit - spentThisMonth : null;

  const history = (historyRows as { month: string; total: string; trips: string }[]).map((r) => ({
    month: r.month,
    total: Number.parseFloat(r.total),
    trips: Number.parseInt(r.trips, 10),
  }));

  return NextResponse.json({
    monthlyLimit,
    spentThisMonth,
    remaining,
    percentUsed,
    avgMonthly: Math.round(avgMonthly),
    currency: 'MXN',
    history,
  });
}

// PATCH /api/budget  { monthlyLimit: number }
export async function PATCH(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: { monthlyLimit?: unknown } = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const rawLimit = body.monthlyLimit;
  if (typeof rawLimit !== 'number' || rawLimit < 0 || !Number.isFinite(rawLimit)) {
    return NextResponse.json({ error: 'monthlyLimit must be a non-negative number' }, { status: 400 });
  }
  const monthlyLimit = Math.round(rawLimit * 100) / 100;

  await ensureBudgetSchema();

  await sql`
    INSERT INTO budget_settings (user_id, monthly_limit, currency, updated_at)
    VALUES (${user.userId}, ${monthlyLimit}, 'MXN', NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET monthly_limit = EXCLUDED.monthly_limit,
          updated_at    = NOW()
  `;

  return NextResponse.json({ ok: true, monthlyLimit });
}
