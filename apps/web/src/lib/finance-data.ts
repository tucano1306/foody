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
import { listCreditsForPlan } from '@/lib/debt-data';
import { normalizeShare } from '@/lib/expense-scope';
import { normalizeExpenseKind } from '@/lib/expense-kind';
import { ensureExpenseKindSchema, ensureExpenseScopeSchema } from '@/lib/ensure-schema';
import { buildPaymentAggregates, type PaidRecordInput } from '@/lib/payment-aggregates';
import {
  computeGroceryInsight,
  type CategorySpendInput,
  type GroceryInsight,
  type MonthTotal,
  type StoreSpend,
} from '@/lib/grocery-insights';
import {
  computeOtherSpend,
  EMPTY_OTHER_SPEND,
  type KindSpendInput,
  type OtherSpendInsight,
  type PlaceSpend,
} from '@/lib/other-spend';
import {
  buildFinancePlan,
  type CreditInput,
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
  /** El gasto que NO es super: comida fuera, farmacia, gasolina, hogar. */
  otherSpend: OtherSpendInsight;
  /**
   * Porcentajes de negocio ponderados del mes, uno por bloque de gasto.
   *
   * Viajan al cliente porque el interruptor «contar el negocio en el plan»
   * RECALCULA el plan con el mismo motor puro; sin ellos ese recálculo dejaba
   * el super y los gastos de fuera enteros del lado personal, que es justo lo
   * que el interruptor promete quitar.
   */
  groceriesBusinessShare: number;
  otherBusinessShare: number;
  /** Totales de super por mes (para la mini gráfica de tendencia). */
  history: MonthTotal[];
  payments: FixedPaymentInput[];
  /** Tarjetas y créditos que alimentan el plan. */
  credits: CreditInput[];
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

  // Los ingresos también se reparten personal/negocio: sin esto el negocio
  // solo tendría gastos y siempre parecería estar en pérdidas.
  await ensureExpenseScopeSchema();

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
    businessShare: normalizeShare(row.business_share),
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
    sql`SELECT id, name, amount, due_day, created_at, business_share FROM monthly_payments WHERE user_id = ${userId} AND is_active = true ORDER BY due_day ASC`,
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
      businessShare: normalizeShare(row.business_share),
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
/**
 * Porcentaje del super que corresponde al negocio, PONDERADO por importe.
 *
 * No es la media de los porcentajes: una compra de $500 al 100 % pesa mucho más
 * que una de $10 al 100 %. Se calcula sobre las compras del mes en curso, que es
 * el período que el plan resta.
 */
async function loadGroceryBusinessShare(userId: string): Promise<number> {
  const rows = await sql`
    SELECT
      COALESCE(SUM(COALESCE(total_spent, 0) * COALESCE(business_share, 0) / 100), 0) AS business,
      COALESCE(SUM(COALESCE(total_spent, 0)), 0) AS total
    FROM shopping_trips
    WHERE user_id = ${userId} AND kind = 'grocery' AND date >= DATE_TRUNC('month', NOW())
  `;
  const r = (rows[0] ?? {}) as Record<string, unknown>;
  const total = num(r.total);
  return total > 0 ? normalizeShare((num(r.business) / total) * 100) : 0;
}

/** Lo mismo para el gasto que no es super: su propio porcentaje de negocio. */
async function loadOtherBusinessShare(userId: string): Promise<number> {
  const rows = await sql`
    SELECT
      COALESCE(SUM(COALESCE(total_spent, 0) * COALESCE(business_share, 0) / 100), 0) AS business,
      COALESCE(SUM(COALESCE(total_spent, 0)), 0) AS total
    FROM shopping_trips
    WHERE user_id = ${userId} AND kind <> 'grocery' AND date >= DATE_TRUNC('month', NOW())
  `;
  const r = (rows[0] ?? {}) as Record<string, unknown>;
  const total = num(r.total);
  return total > 0 ? normalizeShare((num(r.business) / total) * 100) : 0;
}

/**
 * El gasto que NO es super, por mes, por tipo y por sitio.
 *
 * Son tickets sin productos vinculados casi siempre (nadie desglosa una cena),
 * así que todo sale de `shopping_trips.total_spent` y no hay riesgo de contar
 * dos veces: las compras sueltas de `product_purchases` sin ticket son siempre
 * de despensa y viven del otro lado.
 */
async function loadOtherSpend(userId: string): Promise<OtherSpendInsight> {
  const [monthRows, kindRows, placeRows] = await Promise.all([
    sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
        COALESCE(SUM(COALESCE(total_spent, 0)), 0) AS total,
        COUNT(*) AS trips
      FROM shopping_trips
      WHERE user_id = ${userId} AND kind <> 'grocery'
        AND date >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month ASC
    `,
    sql`
      SELECT
        kind,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW())
                          THEN COALESCE(total_spent, 0) ELSE 0 END), 0) AS current_month,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                          THEN COALESCE(total_spent, 0) ELSE 0 END), 0) AS prev_month,
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', NOW())) AS count
      FROM shopping_trips
      WHERE user_id = ${userId} AND kind <> 'grocery'
        AND date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      GROUP BY kind
      ORDER BY current_month DESC
    `,
    sql`
      SELECT
        COALESCE(NULLIF(TRIM(store_name), ''), 'Sin nombre') AS name,
        COALESCE(SUM(COALESCE(total_spent, 0)), 0) AS total,
        COUNT(*) AS count
      FROM shopping_trips
      WHERE user_id = ${userId} AND kind <> 'grocery'
        AND date >= DATE_TRUNC('month', NOW())
      GROUP BY COALESCE(NULLIF(TRIM(store_name), ''), 'Sin nombre')
      ORDER BY total DESC
      LIMIT 5
    `,
  ]);

  const monthlyTotals: MonthTotal[] = (monthRows as Record<string, unknown>[]).map((r) => ({
    month: String(r.month),
    total: num(r.total),
    trips: Math.trunc(num(r.trips)),
  }));

  const byKind: KindSpendInput[] = (kindRows as Record<string, unknown>[]).map((r) => ({
    kind: normalizeExpenseKind(r.kind),
    currentMonth: num(r.current_month),
    prevMonth: num(r.prev_month),
    count: Math.trunc(num(r.count)),
  }));

  const places: PlaceSpend[] = (placeRows as Record<string, unknown>[]).map((r) => ({
    name: String(r.name),
    total: num(r.total),
    count: Math.trunc(num(r.count)),
  }));

  return computeOtherSpend({ monthlyTotals, byKind, places });
}

async function loadGroceryBreakdown(userId: string): Promise<{
  categories: CategorySpendInput[];
  stores: StoreSpend[];
}> {
  const [categoryRows, storeRows] = await Promise.all([
    sql`
      SELECT
        -- NULLIF además de COALESCE: había productos con la categoría en
        -- cadena VACÍA, que COALESCE deja pasar. Se colaban en el desglose
        -- como una fila con importe y sin nombre.
        COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría') AS category,
        SUM(CASE WHEN DATE_TRUNC('month', pp.purchased_at) = DATE_TRUNC('month', NOW())
                 THEN COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0) ELSE 0 END) AS current_month,
        SUM(CASE WHEN DATE_TRUNC('month', pp.purchased_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                 THEN COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0) ELSE 0 END) AS prev_month
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      -- Solo los ítems de tickets de SUPER: si un ticket se reclasificó a
      -- "comida fuera", sus productos dejan de contar como despensa.
      LEFT JOIN shopping_trips t ON t.id = pp.trip_id
      WHERE pp.user_id = ${userId}
        AND (pp.trip_id IS NULL OR t.kind = 'grocery')
        AND pp.purchased_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      GROUP BY COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría')
      ORDER BY current_month DESC
    `,
    sql`
      SELECT name, COUNT(*) AS trips, SUM(total) AS total_spent
      FROM (
        SELECT COALESCE(store_name, 'Sin tienda') AS name, COALESCE(total_spent, 0) AS total
        FROM shopping_trips
        WHERE user_id = ${userId} AND kind = 'grocery' AND date >= DATE_TRUNC('month', NOW())
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
  // Todo lo que sigue filtra por `kind`: la columna tiene que existir antes.
  await ensureExpenseKindSchema();

  const [
    incomeRows, goalRows, contributionRows, fixedPayments, budget, breakdown, credits,
    groceriesBusinessShare, otherSpend, otherBusinessShare,
  ] = await Promise.all([
      sql`SELECT * FROM finance_income_sources WHERE user_id = ${userId} ORDER BY created_at ASC`,
      sql`SELECT * FROM finance_goals WHERE user_id = ${userId} ORDER BY priority ASC, target_date ASC NULLS LAST, created_at ASC`,
      sql`SELECT * FROM finance_goal_contributions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
      loadFixedPayments(userId),
      getBudgetData(userId),
      loadGroceryBreakdown(userId),
      // Las cuotas de tarjetas y créditos son compromiso mensual: sin ellas el
      // plan repartiría entre metas un dinero que ya está comprometido.
      listCreditsForPlan(userId).catch(() => [] as CreditInput[]),
      loadGroceryBusinessShare(userId).catch(() => 0),
      // Comer fuera, farmacia, gasolina: gasto real que hasta ahora no restaba
      // en ningún sitio. Si esta consulta falla, el plan sigue siendo el de
      // antes en vez de caerse entero.
      loadOtherSpend(userId).catch(() => EMPTY_OTHER_SPEND),
      loadOtherBusinessShare(userId).catch(() => 0),
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
    credits,
    groceriesMonthly: groceries.baseline,
    groceriesSource: groceries.baselineSource,
    groceriesSpentThisMonth: groceries.spentThisMonth,
    groceriesBusinessShare,
    groceries,
    otherExpensesMonthly: otherSpend.baseline,
    otherBusinessShare,
    otherSpend,
    extraMonthly,
  };

  const plan = buildFinancePlan(input);

  return {
    ...plan,
    incomes,
    rawGoals: goals,
    contributions,
    groceries,
    otherSpend,
    groceriesBusinessShare,
    otherBusinessShare,
    history: budget.history,
    payments: fixedPayments,
    credits,
  };
}
