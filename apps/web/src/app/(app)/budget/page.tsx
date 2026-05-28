import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import ModernTitle from '@/components/layout/ModernTitle';
import BudgetView from '@/components/budget/BudgetView';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Presupuesto — Foody' };

async function getBudgetData(userId: string) {
  // Ensure budget_settings table exists
  await sql`
    CREATE TABLE IF NOT EXISTS budget_settings (
      id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      monthly_limit DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency      VARCHAR(10)   NOT NULL DEFAULT 'MXN',
      updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
      UNIQUE (user_id)
    )
  `;

  const [settingsRows, currentRows, historyRows, avgRows] = await Promise.all([
    sql`
      SELECT monthly_limit FROM budget_settings
      WHERE user_id = ${userId} LIMIT 1
    `,
    sql`
      SELECT COALESCE(SUM(COALESCE(total_price, unit_price * quantity, 0)), 0) AS total
      FROM product_purchases
      WHERE user_id = ${userId}
        AND purchased_at >= DATE_TRUNC('month', NOW())
    `,
    sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', purchased_at), 'YYYY-MM') AS month,
        COALESCE(SUM(COALESCE(total_price, unit_price * quantity, 0)), 0) AS total,
        COUNT(*) AS trips
      FROM product_purchases
      WHERE user_id = ${userId}
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
        WHERE user_id = ${userId}
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
  const avgMonthly = Math.round(Number.parseFloat((avgRows[0] as { avg_monthly: string }).avg_monthly ?? '0'));
  const percentUsed = monthlyLimit > 0 ? Math.min(200, (spentThisMonth / monthlyLimit) * 100) : null;
  const remaining = monthlyLimit > 0 ? monthlyLimit - spentThisMonth : null;
  const history = (historyRows as { month: string; total: string; trips: string }[]).map((r) => ({
    month: r.month,
    total: Number.parseFloat(r.total),
    trips: Number.parseInt(r.trips, 10),
  }));

  return { monthlyLimit, spentThisMonth, remaining, percentUsed, avgMonthly, currency: 'MXN', history };
}

export default async function BudgetPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const data = await getBudgetData(session.userId);

  return (
    <div className="space-y-5">
      <ModernTitle title="💰 Presupuesto" subtitle="Controla tu gasto mensual en el supermercado" />
      <BudgetView initialData={data} />
    </div>
  );
}
