/**
 * budget-data.ts — datos de la sección Presupuesto.
 * Compartido por la página server-side y GET /api/budget (los route files
 * solo pueden exportar handlers).
 *
 * El gasto se calcula igual que en los widgets del home (byStore): el
 * total_spent de cada ticket es la cifra autoritativa (un ticket guardado
 * solo con total — recibo sin vincular — cuenta completo), más las compras
 * sueltas sin ticket agrupadas por sesión. Sumar product_purchases a secas
 * ignoraría los tickets sin items y contaría doble los que sí tienen.
 */
import { sql } from '@/lib/db';

export interface BudgetMonthEntry {
  month: string; // YYYY-MM
  total: number;
  trips: number;
}

export interface BudgetData {
  monthlyLimit: number;
  spentThisMonth: number;
  remaining: number | null;
  percentUsed: number | null;
  avgMonthly: number;
  currency: string;
  history: BudgetMonthEntry[];
}

let schemaReady = false;

export async function ensureBudgetSchema(): Promise<void> {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS budget_settings (
      id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      monthly_limit DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency    VARCHAR(10)   NOT NULL DEFAULT 'USD',
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
      UNIQUE (user_id)
    )
  `;
  schemaReady = true;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getBudgetData(userId: string): Promise<BudgetData> {
  await ensureBudgetSchema();

  const [settingsRows, historyRows] = await Promise.all([
    sql`
      SELECT monthly_limit FROM budget_settings
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    // Últimos 6 meses INCLUYENDO el actual — el mes en curso es justo el que
    // el usuario quiere ver reflejado al registrar un ticket.
    sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', d), 'YYYY-MM') AS month,
        COALESCE(SUM(total), 0) AS total,
        COUNT(*) AS trips
      FROM (
        SELECT date AS d, COALESCE(total_spent, 0) AS total
        FROM shopping_trips
        WHERE user_id = ${userId}
        UNION ALL
        SELECT purchased_at AS d, SUM(COALESCE(total_price, unit_price * quantity, 0)) AS total
        FROM product_purchases
        WHERE user_id = ${userId} AND trip_id IS NULL
        GROUP BY purchased_at, COALESCE(store_name, '')
      ) visits
      WHERE d >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
      GROUP BY DATE_TRUNC('month', d)
      ORDER BY month ASC
    `,
  ]);

  const monthlyLimit = settingsRows.length > 0
    ? Number.parseFloat((settingsRows[0] as { monthly_limit: string }).monthly_limit)
    : 0;

  const history: BudgetMonthEntry[] = (historyRows as { month: string; total: string; trips: string }[]).map((r) => ({
    month: r.month,
    total: Number.parseFloat(r.total),
    trips: Number.parseInt(r.trips, 10),
  }));

  const nowKey = currentMonthKey();
  const spentThisMonth = history.find((h) => h.month === nowKey)?.total ?? 0;

  // Promedio solo sobre meses COMPLETOS con datos (el mes en curso a medias
  // distorsionaría la sugerencia de límite).
  const pastMonths = history.filter((h) => h.month !== nowKey);
  const avgMonthly = pastMonths.length > 0
    ? Math.round(pastMonths.reduce((s, h) => s + h.total, 0) / pastMonths.length)
    : 0;

  const percentUsed = monthlyLimit > 0 ? Math.min(200, (spentThisMonth / monthlyLimit) * 100) : null;
  const remaining = monthlyLimit > 0 ? monthlyLimit - spentThisMonth : null;

  return { monthlyLimit, spentThisMonth, remaining, percentUsed, avgMonthly, currency: 'USD', history };
}
