/**
 * finance-data.ts — capa de datos del Plan Financiero.
 *
 * Junta las tres fuentes que ya tiene la app —ingresos declarados por el
 * usuario, pagos mensuales (con su deuda acumulada) y el gasto real de super—
 * y se las pasa al motor puro de finance-engine.ts.
 *
 * Igual que budget-data.ts, vive fuera de los route handlers para poder usarse
 * también desde el render server-side de la página.
 */
import { sql } from '@/lib/db';
import { getBudgetData } from '@/lib/budget-data';
import { buildPaymentAggregates, type PaidRecordInput } from '@/lib/payment-aggregates';
import {
  computeGroceryInsight,
  type CategorySpendInput,
  type GroceryInsight,
  type MonthTotal,
  type StoreSpend,
} from '@/lib/grocery-insights';
import {
  buildFinancePlan,
  type FinanceGoal,
  type FinancePlan,
  type FixedPaymentInput,
  type GoalKind,
  type GoalStatus,
  type IncomeFrequency,
  type IncomeSource,
  type PlanInput,
} from '@/lib/finance-engine';

export const GOAL_KINDS: readonly GoalKind[] = ['trip', 'debt', 'project', 'purchase', 'emergency'];
export const GOAL_STATUSES: readonly GoalStatus[] = ['active', 'paused', 'done'];
export const INCOME_FREQUENCIES: readonly IncomeFrequency[] = ['monthly', 'biweekly', 'weekly', 'yearly', 'one_time'];

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface FinancePlanPayload extends FinancePlan {
  incomes: IncomeSource[];
  rawGoals: FinanceGoal[];
  contributions: GoalContribution[];
  /** Análisis de las compras reales que alimenta el plan. */
  groceries: GroceryInsight;
  /** Totales de super por mes (para la mini gráfica de tendencia). */
  history: MonthTotal[];
  payments: FixedPaymentInput[];
}

let schemaReady = false;

export async function ensureFinanceSchema(): Promise<void> {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS finance_income_sources (
      id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      name       VARCHAR(120)  NOT NULL,
      amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
      frequency  VARCHAR(20)   NOT NULL DEFAULT 'monthly',
      is_active  BOOLEAN       NOT NULL DEFAULT true,
      note       TEXT          NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_income_user ON finance_income_sources (user_id, is_active)`;

  await sql`
    CREATE TABLE IF NOT EXISTS finance_goals (
      id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      name             VARCHAR(160)  NOT NULL,
      emoji            VARCHAR(12)   NOT NULL DEFAULT '🎯',
      kind             VARCHAR(20)   NOT NULL DEFAULT 'project',
      target_amount    DECIMAL(12,2) NOT NULL,
      saved_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
      target_date      DATE          NULL,
      priority         SMALLINT      NOT NULL DEFAULT 2,
      monthly_override DECIMAL(12,2) NULL,
      status           VARCHAR(12)   NOT NULL DEFAULT 'active',
      note             TEXT          NULL,
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_goals_user ON finance_goals (user_id, status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS finance_goal_contributions (
      id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      goal_id    UUID          NOT NULL REFERENCES finance_goals("id") ON DELETE CASCADE,
      user_id    UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      amount     DECIMAL(12,2) NOT NULL,
      note       TEXT          NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_contrib_goal ON finance_goal_contributions (goal_id, created_at DESC)`;

  schemaReady = true;
}

// ─── Mapeo de filas ───────────────────────────────────────────────────────────

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Las columnas DATE llegan como Date o "YYYY-MM-DD…"; siempre salen YYYY-MM-DD. */
function dateKey(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function mapGoalRow(row: Record<string, unknown>): FinanceGoal {
  const kind = String(row.kind ?? 'project') as GoalKind;
  const status = String(row.status ?? 'active') as GoalStatus;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    emoji: String(row.emoji ?? '🎯'),
    kind: GOAL_KINDS.includes(kind) ? kind : 'project',
    targetAmount: num(row.target_amount),
    savedAmount: num(row.saved_amount),
    targetDate: dateKey(row.target_date),
    priority: Math.trunc(num(row.priority, 2)),
    monthlyOverride: row.monthly_override == null ? null : num(row.monthly_override),
    status: GOAL_STATUSES.includes(status) ? status : 'active',
    note: (row.note as string | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

export function mapIncomeRow(row: Record<string, unknown>): IncomeSource {
  const frequency = String(row.frequency ?? 'monthly') as IncomeFrequency;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    amount: num(row.amount),
    frequency: INCOME_FREQUENCIES.includes(frequency) ? frequency : 'monthly',
    isActive: row.is_active == null ? true : Boolean(row.is_active),
    note: (row.note as string | null) ?? null,
  };
}

function mapContributionRow(row: Record<string, unknown>): GoalContribution {
  return {
    id: String(row.id),
    goalId: String(row.goal_id),
    amount: num(row.amount),
    note: (row.note as string | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

// ─── Pagos fijos (reutiliza los agregados de la sección Pagos) ────────────────

async function loadFixedPayments(userId: string): Promise<FixedPaymentInput[]> {
  const [rows, paidRows] = await Promise.all([
    sql`SELECT id, name, amount, due_day, created_at FROM monthly_payments WHERE user_id = ${userId} AND is_active = true ORDER BY due_day ASC`,
    sql`SELECT payment_id, month, year, amount, actual_amount, paid_at FROM payment_records WHERE user_id = ${userId} AND status = 'paid'`,
  ]);

  const paidByPayment = new Map<string, PaidRecordInput[]>();
  for (const rec of paidRows) {
    const pid = String(rec.payment_id);
    const list = paidByPayment.get(pid) ?? [];
    list.push({
      month: Math.trunc(num(rec.month)),
      year: Math.trunc(num(rec.year)),
      amount: num(rec.amount),
      actualAmount: rec.actual_amount == null ? null : num(rec.actual_amount),
      paidAt: rec.paid_at == null ? null : iso(rec.paid_at),
    });
    paidByPayment.set(pid, list);
  }

  return rows.map((row) => {
    const id = String(row.id);
    const amount = num(row.amount);
    const dueDay = Math.trunc(num(row.due_day, 1));
    const aggregates = buildPaymentAggregates({
      createdAt: new Date(row.created_at as string),
      dueDay,
      amount,
      paidRecords: paidByPayment.get(id) ?? [],
    });
    return {
      id,
      name: String(row.name ?? ''),
      amount,
      dueDay,
      isPaidThisMonth: aggregates.isPaidThisMonth,
      missedMonths: aggregates.missedMonths,
      accumulatedDebt: aggregates.accumulatedDebt,
    };
  });
}

// ─── Compras reales ───────────────────────────────────────────────────────────

/**
 * Gasto de super por categoría y por tienda del mes en curso.
 *
 * Mismo criterio que Stats: las categorías salen de los ítems (product_purchases
 * unidos a products) y las visitas combinan tickets formales con compras sueltas
 * sin ticket, agrupadas por sesión para no contar cada línea como una visita.
 */
async function loadGroceryBreakdown(userId: string): Promise<{
  categories: CategorySpendInput[];
  stores: StoreSpend[];
}> {
  const [categoryRows, storeRows] = await Promise.all([
    sql`
      SELECT
        COALESCE(p.category, 'Sin categoría') AS category,
        SUM(CASE WHEN DATE_TRUNC('month', pp.purchased_at) = DATE_TRUNC('month', NOW())
                 THEN COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0) ELSE 0 END) AS current_month,
        SUM(CASE WHEN DATE_TRUNC('month', pp.purchased_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                 THEN COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0) ELSE 0 END) AS prev_month
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      WHERE pp.user_id = ${userId}
        AND pp.purchased_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      GROUP BY COALESCE(p.category, 'Sin categoría')
      ORDER BY current_month DESC
    `,
    sql`
      SELECT name, COUNT(*) AS trips, SUM(total) AS total_spent
      FROM (
        SELECT COALESCE(store_name, 'Sin tienda') AS name, COALESCE(total_spent, 0) AS total
        FROM shopping_trips
        WHERE user_id = ${userId} AND date >= DATE_TRUNC('month', NOW())
        UNION ALL
        SELECT COALESCE(store_name, 'Sin tienda') AS name,
               SUM(COALESCE(total_price, unit_price * quantity, 0)) AS total
        FROM product_purchases
        WHERE user_id = ${userId} AND trip_id IS NULL
          AND purchased_at >= DATE_TRUNC('month', NOW())
        GROUP BY COALESCE(store_name, 'Sin tienda'), purchased_at
      ) visits
      GROUP BY name
      ORDER BY total_spent DESC
      LIMIT 5
    `,
  ]);

  return {
    categories: (categoryRows as Record<string, unknown>[]).map((r) => ({
      category: String(r.category),
      currentMonth: num(r.current_month),
      prevMonth: num(r.prev_month),
    })),
    stores: (storeRows as Record<string, unknown>[]).map((r) => ({
      name: String(r.name),
      total: num(r.total_spent),
      trips: Math.trunc(num(r.trips)),
    })),
  };
}

// ─── Ensamblado ───────────────────────────────────────────────────────────────

export async function getFinancePlan(userId: string, extraMonthly = 0): Promise<FinancePlanPayload> {
  await ensureFinanceSchema();

  const [incomeRows, goalRows, contributionRows, fixedPayments, budget, breakdown] = await Promise.all([
    sql`SELECT * FROM finance_income_sources WHERE user_id = ${userId} ORDER BY created_at ASC`,
    sql`SELECT * FROM finance_goals WHERE user_id = ${userId} ORDER BY priority ASC, target_date ASC NULLS LAST, created_at ASC`,
    sql`SELECT * FROM finance_goal_contributions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
    loadFixedPayments(userId),
    getBudgetData(userId),
    loadGroceryBreakdown(userId),
  ]);

  const incomes = incomeRows.map((r) => mapIncomeRow(r as Record<string, unknown>));
  const goals = goalRows.map((r) => mapGoalRow(r as Record<string, unknown>));
  const contributions = contributionRows.map((r) => mapContributionRow(r as Record<string, unknown>));

  // El plan resta lo que REALMENTE se gasta en super: el historial de tickets
  // manda sobre el límite declarado, que solo se usa si aún no hay compras.
  const groceries = computeGroceryInsight({
    monthlyTotals: budget.history,
    categories: breakdown.categories,
    stores: breakdown.stores,
    limit: budget.monthlyLimit,
  });

  const input: PlanInput = {
    incomes,
    goals,
    fixedPayments,
    groceriesMonthly: groceries.baseline,
    groceriesSource: groceries.baselineSource,
    groceriesSpentThisMonth: groceries.spentThisMonth,
    groceries,
    extraMonthly,
  };

  const plan = buildFinancePlan(input);

  return {
    ...plan,
    incomes,
    rawGoals: goals,
    contributions,
    groceries,
    history: budget.history,
    payments: fixedPayments,
  };
}
