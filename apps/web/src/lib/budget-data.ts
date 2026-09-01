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
 *
 * SOLO cuenta el super (`kind = 'grocery'`). El límite mensual que el usuario
 * configura aquí es un límite de DESPENSA: meter en él la cena del sábado o la
 * gasolina hacía que el presupuesto se pasara de rojo por gastos que nunca
 * pretendió cubrir.
 */
import { sql } from '@/lib/db';
import { ensureExpenseKindSchema } from '@/lib/ensure-schema';

// El tipo vive en budget-history.ts, que es donde estan las funciones puras
// que lo manipulan. Tenerlo declarado dos veces ya provoco que una copia
// ganara un campo y la otra no.
import { budgetFigures, type BudgetMonthEntry } from '@/lib/budget-history';
export type { BudgetMonthEntry };

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
  // Antes de filtrar por `kind` hay que garantizar que la columna existe.
  await ensureExpenseKindSchema();

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
        COALESCE(SUM(personal), 0) AS personal,
        COUNT(*) AS trips
      FROM (
        -- Los tickets llevan su porcentaje de negocio; la parte personal se
        -- calcula aqui para que el reparto y la suma ocurran de una sola vez.
        SELECT date AS d,
               COALESCE(total_spent, 0) AS total,
               COALESCE(total_spent, 0) * (1 - COALESCE(business_share, 0) / 100.0) AS personal
        FROM shopping_trips
        WHERE user_id = ${userId} AND kind = 'grocery'
        UNION ALL
        -- Las compras sueltas no tienen ambito: cuentan enteras como personales,
        -- que es lo que son mientras nadie diga lo contrario.
        SELECT purchased_at AS d,
               SUM(COALESCE(total_price, unit_price * quantity, 0)) AS total,
               SUM(COALESCE(total_price, unit_price * quantity, 0)) AS personal
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

  const history: BudgetMonthEntry[] = (
    historyRows as { month: string; total: string; personal: string; trips: string }[]
  ).map((r) => ({
    month: r.month,
    total: Number.parseFloat(r.total),
    personal: Math.round(Number.parseFloat(r.personal) * 100) / 100,
    trips: Number.parseInt(r.trips, 10),
  }));

  // Las cuatro cifras salen de la MISMA funcion que usa la pantalla al cambiar
  // de pestaña: con la formula duplicada, el dia que cambie una copia, «llevas
  // gastado» y la grafica de debajo dejarian de cuadrar.
  const { spentThisMonth, avgMonthly, percentUsed, remaining } = budgetFigures(history, monthlyLimit);

  return { monthlyLimit, spentThisMonth, remaining, percentUsed, avgMonthly, currency: 'USD', history };
}
