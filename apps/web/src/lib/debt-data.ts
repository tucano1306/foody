/**
 * debt-data.ts — capa de datos de Deudas y Créditos.
 *
 * Regla de integridad: **el saldo NO se edita, se deriva**. Cada evento (un
 * consumo, un abono, el interés del mes, una comisión) es una fila inmutable en
 * `debt_movements`, y `debts.current_balance` es solo una caché que se recalcula
 * sumando el libro mayor después de cada escritura. Corregir un error no es
 * tocar un número: es añadir o borrar un movimiento. Eso hace que la sección sea
 * auditable y que el saldo nunca pueda "desincronizarse" de su historia.
 *
 * La aritmética vive en debt-engine.ts (pura y probada); aquí solo hay SQL,
 * validación y orquestación.
 */
import { sql } from './db';
import {
  accrualCycles,
  buildDebtAdvice,
  buildPortfolio,
  allocatePayment,
  frenchInstallment,
  projectDebt,
  round2,
  safeAmount,
  toMonthlyRate,
  toPeriodKey,
  type DebtAdvice,
  type DebtKind,
  type DebtPortfolio,
  type DebtProjection,
  type DebtStatus,
  type MovementKind,
  type PayoffStrategy,
  type PortfolioDebt,
  type RatePeriod,
} from './debt-engine';
import { normalizeShare } from './expense-scope';

// ─── Tipos expuestos ──────────────────────────────────────────────────────────

export interface Debt {
  id: string;
  userId: string;
  name: string;
  kind: DebtKind;
  issuer: string | null;
  accountLast4: string | null;
  currency: string;
  /** Lo que se debía al dar de alta la deuda. */
  originalAmount: number;
  /** Saldo actual, derivado del libro mayor. */
  currentBalance: number;
  rate: number;
  ratePeriod: RatePeriod;
  strategy: PayoffStrategy;
  termMonths: number | null;
  /** Fecha límite YYYY-MM-DD de la estrategia `by_date`. */
  payoffDate: string | null;
  customPayment: number | null;
  minPercent: number | null;
  minFloor: number | null;
  extraMonthly: number;
  /** 0-100: qué parte de este crédito corresponde al negocio. */
  businessShare: number;
  /**
   * Pago mensual que YA cobra esta cuota, si el usuario lo enlazó.
   *
   * La cuota del coche vive a la vez en Pagos (recordatorio, día de cobro) y
   * en Deudas (saldo, interés, amortización). Las dos hacen falta, pero el
   * dinero sale una sola vez: con el enlace puesto, el plan deja de restar la
   * cuota porque el recibo ya la cubre. Ver duplicate-obligations.ts.
   */
  linkedPaymentId: string | null;
  /** El usuario revisó el posible duplicado y dijo que son cosas distintas. */
  duplicateDismissed: boolean;
  /**
   * Fin de una promocion al 0 %, YYYY-MM-DD.
   *
   * Con esto puesto, la deuda deja de ser «gratis» y pasa a ser gratis HASTA
   * esa fecha. Ver debt-promo.ts.
   */
  promoEndsOn: string | null;
  /** Tasa que empieza a correr cuando la promocion caduca. */
  rateAfterPromo: number | null;
  /** Dias del ciclo de facturacion del estado de cuenta (normalmente 30 o 31). */
  cycleDays: number | null;
  /** Dia del mes en que cierra el estado de cuenta. */
  statementDay: number | null;
  creditLimit: number | null;
  dueDay: number;
  openedAt: string;
  lastAccrualAt: string;
  status: DebtStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtMovement {
  id: string;
  debtId: string;
  kind: MovementKind;
  amount: number;
  interestPart: number;
  principalPart: number;
  feesPart: number;
  balanceBefore: number;
  balanceAfter: number;
  paymentMethod: string | null;
  periodKey: string | null;
  note: string | null;
  occurredAt: string;
}

/** Cuánto del saldo es capital, cuánto interés pendiente y cuánto comisiones. */
export interface DebtBreakdown {
  principalOwed: number;
  interestOwed: number;
  feesOwed: number;
  /** Total abonado históricamente. */
  totalPaid: number;
  /** De todo lo abonado, cuánto se fue en intereses. */
  totalInterestPaid: number;
  /** De todo lo abonado, cuánto bajó realmente la deuda. */
  totalPrincipalPaid: number;
  /** % del capital original ya liquidado (0–100). */
  progress: number;
}

export interface DebtWithProjection extends Debt {
  projection: DebtProjection;
  breakdown: DebtBreakdown;
  advice: DebtAdvice[];
  /** Días hasta el próximo día de pago (negativo = ya pasó). */
  daysUntilDue: number;
  /** % de la línea usada — solo tarjetas con cupo declarado. */
  utilization: number | null;
}

export interface CreateDebtInput {
  name: string;
  kind?: DebtKind;
  issuer?: string | null;
  accountLast4?: string | null;
  currency?: string;
  balance: number;
  rate: number;
  ratePeriod?: RatePeriod;
  strategy?: PayoffStrategy;
  termMonths?: number | null;
  payoffDate?: string | null;
  customPayment?: number | null;
  minPercent?: number | null;
  minFloor?: number | null;
  extraMonthly?: number;
  businessShare?: number;
  promoEndsOn?: string | null;
  rateAfterPromo?: number | null;
  cycleDays?: number | null;
  statementDay?: number | null;
  creditLimit?: number | null;
  dueDay?: number;
  note?: string | null;
}

export type UpdateDebtInput = Partial<Omit<CreateDebtInput, 'balance'>> & {
  status?: DebtStatus;
  /** null desenlaza; un id apunta al recibo de Pagos que cobra esta cuota. */
  linkedPaymentId?: string | null;
  /** true = «no son el mismo pago», y la app deja de preguntarlo. */
  duplicateDismissed?: boolean;
};

// ─── Esquema ──────────────────────────────────────────────────────────────────

let debtSchemaEnsured = false;

/**
 * Crea las tablas si faltan. Idempotente y cacheado por arranque en frío, igual
 * que el resto de `ensure*Schema` de la app.
 */
export async function ensureDebtSchema(): Promise<void> {
  if (debtSchemaEnsured) return;

  await sql`
    CREATE TABLE IF NOT EXISTS debts (
      id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      name            VARCHAR(160)  NOT NULL,
      kind            VARCHAR(20)   NOT NULL DEFAULT 'credit_card',
      issuer          VARCHAR(100),
      account_last4   VARCHAR(4),
      currency        VARCHAR(10)   NOT NULL DEFAULT 'USD',
      original_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
      rate            DECIMAL(9,4)  NOT NULL DEFAULT 0,
      rate_period     VARCHAR(20)   NOT NULL DEFAULT 'monthly',
      strategy        VARCHAR(20)   NOT NULL DEFAULT 'fixed_installment',
      term_months     SMALLINT,
      custom_payment  DECIMAL(12,2),
      min_percent     DECIMAL(5,2),
      min_floor       DECIMAL(12,2),
      extra_monthly   DECIMAL(12,2) NOT NULL DEFAULT 0,
      credit_limit    DECIMAL(12,2),
      due_day         SMALLINT      NOT NULL DEFAULT 1,
      last_accrual_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
      opened_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
      status          VARCHAR(12)   NOT NULL DEFAULT 'active',
      note            TEXT,
      created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS debt_movements (
      id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      debt_id        UUID          NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      user_id        UUID          NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      kind           VARCHAR(20)   NOT NULL,
      amount         DECIMAL(12,2) NOT NULL,
      interest_part  DECIMAL(12,2) NOT NULL DEFAULT 0,
      principal_part DECIMAL(12,2) NOT NULL DEFAULT 0,
      fees_part      DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance_before DECIMAL(12,2) NOT NULL DEFAULT 0,
      balance_after  DECIMAL(12,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(20),
      period_key     VARCHAR(7),
      note           TEXT,
      occurred_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
      created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
    )
  `;

  // Un crédito también puede ser del negocio (préstamo comercial, tarjeta de
  // la empresa). Mismo criterio que el resto de gastos: un solo número 0–100.
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS business_share DECIMAL(5,2) NOT NULL DEFAULT 0`;
  // Promociones al 0 % que CADUCAN. Sin estos dos campos la app trataba un
  // saldo promocional como gratis para siempre y callaba la fecha limite.
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS promo_ends_on DATE`;
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS rate_after_promo DECIMAL(9,4)`;
  // Datos del estado de cuenta, para que las cifras cuadren con el banco:
  // dias del ciclo (el interes se cobra por dia, no por doceavo) y el dia en
  // que cierra el estado.
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS cycle_days SMALLINT`;
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS statement_day SMALLINT`;
  // Fecha tope de la estrategia `by_date`: la tarjeta que hay que liquidar
  // antes de que empiecen a cobrar intereses.
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS payoff_date DATE`;
  // Enlace con el recibo de Pagos que cobra esta misma cuota. NULL = sin
  // enlazar, que es como se comportaba la app antes: nada se empareja solo.
  //
  // Sin FK a monthly_payments a propósito: si el usuario borra el recibo, el
  // enlace queda huérfano y el plan vuelve a contar la cuota —que es lo
  // correcto, porque ese dinero vuelve a salir por ahí—. Una FK con CASCADE
  // haría lo mismo, pero una con RESTRICT impediría borrar el recibo.
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS linked_payment_id UUID`;
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS duplicate_dismissed BOOLEAN NOT NULL DEFAULT false`;

  await sql`CREATE INDEX IF NOT EXISTS idx_debts_user ON debts (user_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_debt_movements ON debt_movements (debt_id, occurred_at DESC)`;
  // Un solo apunte de interés por deuda y mes: la idempotencia del devengo.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_interest_period
      ON debt_movements (debt_id, period_key) WHERE kind = 'interest'
  `;

  debtSchemaEnsured = true;
}

// ─── Conversores ──────────────────────────────────────────────────────────────

function num(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * Las columnas DATE llegan como Date o "YYYY-MM-DD…"; siempre salen YYYY-MM-DD.
 * Se usa UTC a propósito: una fecha sin hora no debe correrse un día según la
 * zona horaria de quien la lea.
 */
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

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value ?? ''));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function mapDebt(row: Record<string, unknown>): Debt {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ''),
    kind: (row.kind as DebtKind) ?? 'other',
    issuer: (row.issuer as string | null) ?? null,
    accountLast4: (row.account_last4 as string | null) ?? null,
    currency: String(row.currency ?? 'USD'),
    originalAmount: num(row.original_amount),
    currentBalance: num(row.current_balance),
    rate: num(row.rate),
    ratePeriod: (row.rate_period as RatePeriod) ?? 'monthly',
    strategy: (row.strategy as PayoffStrategy) ?? 'fixed_installment',
    termMonths: numOrNull(row.term_months),
    payoffDate: dateKey(row.payoff_date),
    customPayment: numOrNull(row.custom_payment),
    minPercent: numOrNull(row.min_percent),
    minFloor: numOrNull(row.min_floor),
    extraMonthly: num(row.extra_monthly),
    businessShare: normalizeShare(row.business_share),
    linkedPaymentId: (row.linked_payment_id as string | null) ?? null,
    duplicateDismissed: Boolean(row.duplicate_dismissed),
    promoEndsOn: dateKey(row.promo_ends_on),
    rateAfterPromo: numOrNull(row.rate_after_promo),
    cycleDays: numOrNull(row.cycle_days),
    statementDay: numOrNull(row.statement_day),
    creditLimit: numOrNull(row.credit_limit),
    dueDay: Math.trunc(num(row.due_day, 1)),
    openedAt: iso(row.opened_at),
    lastAccrualAt: iso(row.last_accrual_at),
    status: (row.status as DebtStatus) ?? 'active',
    note: (row.note as string | null) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapMovement(row: Record<string, unknown>): DebtMovement {
  return {
    id: String(row.id),
    debtId: String(row.debt_id),
    kind: (row.kind as MovementKind) ?? 'adjustment',
    amount: num(row.amount),
    interestPart: num(row.interest_part),
    principalPart: num(row.principal_part),
    feesPart: num(row.fees_part),
    balanceBefore: num(row.balance_before),
    balanceAfter: num(row.balance_after),
    paymentMethod: (row.payment_method as string | null) ?? null,
    periodKey: (row.period_key as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    occurredAt: iso(row.occurred_at),
  };
}

// ─── Saldo derivado del libro mayor ───────────────────────────────────────────

interface LedgerTotals {
  balance: number;
  interestOwed: number;
  feesOwed: number;
  totalPaid: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
}

/**
 * Suma el libro mayor. Es la ÚNICA fuente de verdad del saldo:
 * cargos, intereses y comisiones suman; los abonos restan; los ajustes van con
 * su propio signo.
 */
async function ledgerTotals(debtId: string): Promise<LedgerTotals> {
  const rows = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'payment' THEN -amount ELSE amount END), 0) AS balance,
      COALESCE(SUM(CASE WHEN kind = 'interest' THEN amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN kind = 'payment' THEN interest_part ELSE 0 END), 0) AS interest_owed,
      COALESCE(SUM(CASE WHEN kind = 'fee' THEN amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN kind = 'payment' THEN fees_part ELSE 0 END), 0) AS fees_owed,
      COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN kind = 'payment' THEN interest_part ELSE 0 END), 0) AS total_interest_paid,
      COALESCE(SUM(CASE WHEN kind = 'payment' THEN principal_part ELSE 0 END), 0) AS total_principal_paid
    FROM debt_movements WHERE debt_id = ${debtId}
  `;
  const r = (rows[0] ?? {}) as Record<string, unknown>;
  return {
    balance: round2(Math.max(0, num(r.balance))),
    interestOwed: round2(Math.max(0, num(r.interest_owed))),
    feesOwed: round2(Math.max(0, num(r.fees_owed))),
    totalPaid: round2(num(r.total_paid)),
    totalInterestPaid: round2(num(r.total_interest_paid)),
    totalPrincipalPaid: round2(num(r.total_principal_paid)),
  };
}

/**
 * Recalcula la caché del saldo y marca la deuda como liquidada cuando llega a
 * cero. Nunca reactiva una deuda archivada: ese estado lo decide el usuario.
 */
async function recomputeBalance(debtId: string): Promise<LedgerTotals> {
  const totals = await ledgerTotals(debtId);
  // El estado se decide en JS, no dentro de un CASE en SQL: al escribir
  // `WHEN $n <= 0` Postgres infería el parámetro como INTEGER (por el literal 0)
  // y rechazaba cualquier saldo con centavos — "invalid input syntax for type
  // integer: 899.53". Sacar la comparación del SQL evita la inferencia y además
  // deja la regla a la vista.
  const nextStatus: DebtStatus = totals.balance <= 0 ? 'paid_off' : 'active';
  await sql`
    UPDATE debts SET
      current_balance = ${totals.balance},
      status = CASE WHEN status = 'archived' THEN 'archived' ELSE ${nextStatus} END,
      updated_at = now()
    WHERE id = ${debtId}
  `;
  return totals;
}

// ─── Devengo de intereses ─────────────────────────────────────────────────────

/**
 * Cobra el interés de los ciclos mensuales cerrados desde el último devengo.
 *
 * Se ejecuta perezosamente al leer, no por cron: así el saldo que ve el usuario
 * siempre está al día sin depender de un proceso externo. Es seguro repetirlo —
 * el índice único por (deuda, mes) descarta los duplicados en la base, así que
 * ni los reintentos ni dos pestañas abiertas cobran dos veces el mismo mes.
 */
async function accrueDueInterest(debt: Debt, now: Date = new Date()): Promise<boolean> {
  if (debt.status !== 'active' || debt.currentBalance <= 0) return false;

  const monthlyRate = toMonthlyRate(debt.rate, debt.ratePeriod);
  if (monthlyRate <= 0) return false;

  const cycles = accrualCycles({
    balance: debt.currentBalance,
    monthlyRate,
    from: new Date(debt.lastAccrualAt),
    to: now,
  });
  if (cycles.length === 0) return false;

  for (const cycle of cycles) {
    await sql`
      INSERT INTO debt_movements
        (debt_id, user_id, kind, amount, interest_part, balance_before, balance_after, period_key, note, occurred_at)
      VALUES (
        ${debt.id}, ${debt.userId}, 'interest', ${cycle.interest}, ${cycle.interest},
        ${cycle.openingBalance}, ${cycle.closingBalance}, ${cycle.periodKey},
        ${`Interés del ciclo ${cycle.periodKey}`}, ${cycle.closedAt.toISOString()}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  const lastClosed = cycles.at(-1)!.closedAt.toISOString();
  await sql`
    UPDATE debts SET last_accrual_at = ${lastClosed}, updated_at = now()
    WHERE id = ${debt.id} AND last_accrual_at < ${lastClosed}
  `;
  await recomputeBalance(debt.id);
  return true;
}

// ─── Proyección + desglose ────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Días hasta el próximo día de corte, con el mismo criterio que Pagos. */
function daysUntilDueDay(dueDay: number, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let due = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, daysThisMonth));
  if (due.getTime() < today.getTime()) {
    const daysNext = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
    due = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dueDay, daysNext));
  }
  return Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
}

function decorate(debt: Debt, totals: LedgerTotals, now: Date): DebtWithProjection {
  const projection = projectDebt({
    balance: debt.currentBalance,
    rate: debt.rate,
    ratePeriod: debt.ratePeriod,
    strategy: debt.strategy,
    termMonths: debt.termMonths,
    payoffDate: debt.payoffDate,
    customPayment: debt.customPayment,
    minPercent: debt.minPercent,
    minFloor: debt.minFloor,
    extraMonthly: debt.extraMonthly,
    now,
  });

  const principalOwed = round2(Math.max(0, debt.currentBalance - totals.interestOwed - totals.feesOwed));
  const reference = debt.originalAmount > 0 ? debt.originalAmount : totals.totalPrincipalPaid + principalOwed;
  const progress = reference > 0 ? round2(Math.min(100, (totals.totalPrincipalPaid / reference) * 100)) : 0;

  return {
    ...debt,
    projection,
    breakdown: {
      principalOwed,
      interestOwed: totals.interestOwed,
      feesOwed: totals.feesOwed,
      totalPaid: totals.totalPaid,
      totalInterestPaid: totals.totalInterestPaid,
      totalPrincipalPaid: totals.totalPrincipalPaid,
      progress,
    },
    advice: buildDebtAdvice(
      { name: debt.name, balance: debt.currentBalance, currency: debt.currency },
      projection,
    ),
    daysUntilDue: daysUntilDueDay(debt.dueDay, now),
    utilization:
      debt.creditLimit && debt.creditLimit > 0
        ? round2(Math.min(999, (debt.currentBalance / debt.creditLimit) * 100))
        : null,
  };
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export interface DebtsSnapshot {
  debts: DebtWithProjection[];
  portfolio: DebtPortfolio;
}

/** Todas las deudas del usuario, con el interés del mes ya devengado. */
export async function listDebts(userId: string, now: Date = new Date()): Promise<DebtsSnapshot> {
  await ensureDebtSchema();

  const initial = await sql`
    SELECT * FROM debts WHERE user_id = ${userId} AND status <> 'archived'
    ORDER BY current_balance DESC, created_at DESC
  `;

  // Devenga lo pendiente antes de proyectar: si no, la cuota y el saldo que ve
  // el usuario serían los del mes pasado.
  let changed = false;
  for (const row of initial) {
    if (await accrueDueInterest(mapDebt(row as Record<string, unknown>), now)) changed = true;
  }

  const rows = changed
    ? await sql`
        SELECT * FROM debts WHERE user_id = ${userId} AND status <> 'archived'
        ORDER BY current_balance DESC, created_at DESC
      `
    : initial;

  const debts = await Promise.all(
    rows.map(async (row) => {
      const debt = mapDebt(row as Record<string, unknown>);
      return decorate(debt, await ledgerTotals(debt.id), now);
    }),
  );

  const portfolioInput: PortfolioDebt[] = debts
    .filter((d) => d.currentBalance > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: d.currentBalance,
      monthlyRate: d.projection.monthlyRate,
      installment: d.projection.installment,
      monthlyInterest: d.projection.monthlyInterest,
      monthsToPayoff: d.projection.monthsToPayoff,
      neverPaysOff: d.projection.neverPaysOff,
      status: d.projection.status,
    }));

  return { debts, portfolio: buildPortfolio(portfolioInput, now) };
}

/** Lo mínimo que el Plan Financiero necesita saber de cada crédito. */
export interface CreditForPlan {
  id: string;
  name: string;
  balance: number;
  installment: number;
  monthlyInterest: number;
  monthsToPayoff: number | null;
  neverPaysOff: boolean;
  /** 0-100: qué parte de la cuota corresponde al negocio. */
  businessShare: number;
  /** Recibo de Pagos que ya cobra esta cuota; null = el plan la resta él. */
  linkedPaymentId: string | null;
  /** El usuario ya revisó el posible duplicado y dijo que son distintos. */
  duplicateDismissed: boolean;
  /** Para poder emparejar por nombre con el recibo («Auto» / emisor «GMC»). */
  issuer: string | null;
}

/**
 * Créditos activos proyectados, para el Plan Financiero.
 *
 * Deliberadamente NO devenga intereses ni consulta el libro mayor: es una sola
 * consulta y el resto es cálculo puro. `listDebts` hace una consulta por deuda
 * para el desglose, y el plan no necesita ese detalle — solo la cuota y lo que
 * cuesta al mes.
 */
export async function listCreditsForPlan(
  userId: string,
  now: Date = new Date(),
): Promise<CreditForPlan[]> {
  await ensureDebtSchema();
  const rows = await sql`
    SELECT id, name, current_balance, rate, rate_period, strategy,
           term_months, payoff_date, custom_payment, min_percent, min_floor, extra_monthly, business_share,
           promo_ends_on, rate_after_promo, cycle_days,
           linked_payment_id, duplicate_dismissed, issuer
    FROM debts
    WHERE user_id = ${userId} AND status = 'active' AND current_balance > 0
  `;

  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const balance = num(row.current_balance);
    const projection = projectDebt({
      balance,
      rate: num(row.rate),
      ratePeriod: (row.rate_period as RatePeriod) ?? 'monthly',
      strategy: (row.strategy as PayoffStrategy) ?? 'fixed_installment',
      termMonths: numOrNull(row.term_months),
      payoffDate: dateKey(row.payoff_date),
      customPayment: numOrNull(row.custom_payment),
      minPercent: numOrNull(row.min_percent),
      minFloor: numOrNull(row.min_floor),
      extraMonthly: num(row.extra_monthly),
      // La promocion y los dias del ciclo: sin ellos la proyeccion trata un
      // 0 % temporal como eterno y el interes del mes no cuadra con el banco.
      promoEndsOn: dateKey(row.promo_ends_on),
      rateAfterPromo: numOrNull(row.rate_after_promo),
      cycleDays: numOrNull(row.cycle_days),
      now,
    });
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      balance,
      installment: projection.installment,
      monthlyInterest: projection.monthlyInterest,
      monthsToPayoff: projection.monthsToPayoff,
      neverPaysOff: projection.neverPaysOff,
      businessShare: normalizeShare(row.business_share),
      linkedPaymentId: (row.linked_payment_id as string | null) ?? null,
      duplicateDismissed: Boolean(row.duplicate_dismissed),
      issuer: (row.issuer as string | null) ?? null,
    };
  });
}

export async function getDebt(
  userId: string,
  debtId: string,
  now: Date = new Date(),
): Promise<DebtWithProjection | null> {
  await ensureDebtSchema();
  const rows = await sql`SELECT * FROM debts WHERE id = ${debtId} AND user_id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;

  let debt = mapDebt(rows[0] as Record<string, unknown>);
  if (await accrueDueInterest(debt, now)) {
    const fresh = await sql`SELECT * FROM debts WHERE id = ${debtId} LIMIT 1`;
    if (fresh.length > 0) debt = mapDebt(fresh[0] as Record<string, unknown>);
  }
  return decorate(debt, await ledgerTotals(debt.id), now);
}

export async function listMovements(
  userId: string,
  debtId: string,
  limit = 60,
): Promise<DebtMovement[]> {
  await ensureDebtSchema();
  const rows = await sql`
    SELECT * FROM debt_movements
    WHERE debt_id = ${debtId} AND user_id = ${userId}
    ORDER BY occurred_at DESC, created_at DESC
    LIMIT ${Math.min(Math.max(1, limit), 300)}
  `;
  return rows.map((r) => mapMovement(r as Record<string, unknown>));
}

// ─── Escritura ────────────────────────────────────────────────────────────────

/**
 * Da de alta una deuda y siembra el saldo inicial como el PRIMER movimiento del
 * libro mayor, en vez de escribirlo directo en `current_balance`. Así el saldo
 * es derivable desde el minuto cero y no hay dos caminos para llegar a él.
 */
export async function createDebt(
  userId: string,
  input: CreateDebtInput,
  now: Date = new Date(),
): Promise<DebtWithProjection> {
  await ensureDebtSchema();

  const balance = round2(safeAmount(input.balance));
  const nowIso = now.toISOString();
  const strategy = input.strategy ?? 'fixed_installment';

  // Una cuota fija es una cuota PACTADA: se congela al dar de alta y no se
  // recalcula nunca más. Si se recalculara sobre el saldo vivo, abonar de más
  // bajaría la cuota en vez de acortar el plazo y la fecha de liquidación se
  // alejaría eternamente — justo lo contrario de lo que promete el simulador.
  const lockedPayment =
    input.customPayment ??
    (strategy === 'fixed_installment' && input.termMonths
      ? frenchInstallment(balance, toMonthlyRate(input.rate, input.ratePeriod ?? 'monthly'), input.termMonths)
      : null);

  const rows = await sql`
    INSERT INTO debts (
      user_id, name, kind, issuer, account_last4, currency,
      original_amount, current_balance, rate, rate_period, strategy,
      term_months, payoff_date, custom_payment, min_percent, min_floor, extra_monthly, business_share,
      promo_ends_on, rate_after_promo, cycle_days, statement_day,
      credit_limit, due_day, last_accrual_at, opened_at, status, note, created_at, updated_at
    ) VALUES (
      ${userId}, ${input.name}, ${input.kind ?? 'credit_card'}, ${input.issuer ?? null},
      ${input.accountLast4 ?? null}, ${input.currency ?? 'USD'},
      ${balance}, ${balance}, ${safeAmount(input.rate)}, ${input.ratePeriod ?? 'monthly'},
      ${strategy}, ${input.termMonths ?? null}, ${input.payoffDate || null},
      ${lockedPayment}, ${input.minPercent ?? null}, ${input.minFloor ?? null},
      ${safeAmount(input.extraMonthly)}, ${normalizeShare(input.businessShare)},
      ${input.promoEndsOn ?? null}, ${input.rateAfterPromo ?? null},
      ${input.cycleDays ?? null}, ${input.statementDay ?? null},
      ${input.creditLimit ?? null}, ${input.dueDay ?? 1},
      ${nowIso}, ${nowIso}, 'active', ${input.note ?? null}, now(), now()
    ) RETURNING *
  `;
  const debt = mapDebt(rows[0] as Record<string, unknown>);

  if (balance > 0) {
    await sql`
      INSERT INTO debt_movements
        (debt_id, user_id, kind, amount, principal_part, balance_before, balance_after, note, occurred_at)
      VALUES (${debt.id}, ${userId}, 'charge', ${balance}, ${balance}, 0, ${balance},
              'Saldo inicial declarado', ${nowIso})
    `;
  }

  const totals = await recomputeBalance(debt.id);
  return decorate({ ...debt, currentBalance: totals.balance }, totals, now);
}

export async function updateDebt(
  userId: string,
  debtId: string,
  input: UpdateDebtInput,
  now: Date = new Date(),
): Promise<DebtWithProjection | null> {
  await ensureDebtSchema();
  const existing = await sql`SELECT * FROM debts WHERE id = ${debtId} AND user_id = ${userId} LIMIT 1`;
  if (existing.length === 0) return null;
  const current = mapDebt(existing[0] as Record<string, unknown>);

  // Renegociar el plazo vuelve a pactar la cuota sobre el saldo que queda hoy —
  // salvo que el usuario dicte una cuota concreta, que siempre manda.
  const strategy = input.strategy ?? current.strategy;
  const term = input.termMonths === undefined ? current.termMonths : input.termMonths;
  let nextPayment = input.customPayment === undefined ? current.customPayment : input.customPayment;
  if (
    input.customPayment === undefined &&
    input.termMonths !== undefined &&
    strategy === 'fixed_installment' &&
    term
  ) {
    nextPayment = frenchInstallment(
      current.currentBalance,
      toMonthlyRate(input.rate ?? current.rate, input.ratePeriod ?? current.ratePeriod),
      term,
    );
  }

  // COALESCE-por-campo: lo que no venga en el cuerpo se queda como estaba.
  await sql`
    UPDATE debts SET
      name           = ${input.name ?? current.name},
      kind           = ${input.kind ?? current.kind},
      issuer         = ${input.issuer === undefined ? current.issuer : input.issuer},
      account_last4  = ${input.accountLast4 === undefined ? current.accountLast4 : input.accountLast4},
      currency       = ${input.currency ?? current.currency},
      rate           = ${input.rate === undefined ? current.rate : safeAmount(input.rate)},
      rate_period    = ${input.ratePeriod ?? current.ratePeriod},
      strategy       = ${strategy},
      term_months    = ${term},
      payoff_date    = ${input.payoffDate === undefined ? current.payoffDate : (input.payoffDate || null)},
      custom_payment = ${nextPayment},
      min_percent    = ${input.minPercent === undefined ? current.minPercent : input.minPercent},
      min_floor      = ${input.minFloor === undefined ? current.minFloor : input.minFloor},
      extra_monthly  = ${input.extraMonthly === undefined ? current.extraMonthly : safeAmount(input.extraMonthly)},
      business_share = ${input.businessShare === undefined ? current.businessShare : normalizeShare(input.businessShare)},
      linked_payment_id = ${input.linkedPaymentId === undefined ? current.linkedPaymentId : (input.linkedPaymentId || null)},
      duplicate_dismissed = ${input.duplicateDismissed === undefined ? current.duplicateDismissed : input.duplicateDismissed},
      promo_ends_on    = ${input.promoEndsOn === undefined ? current.promoEndsOn : input.promoEndsOn},
      rate_after_promo = ${input.rateAfterPromo === undefined ? current.rateAfterPromo : input.rateAfterPromo},
      cycle_days       = ${input.cycleDays === undefined ? current.cycleDays : input.cycleDays},
      statement_day    = ${input.statementDay === undefined ? current.statementDay : input.statementDay},
      credit_limit   = ${input.creditLimit === undefined ? current.creditLimit : input.creditLimit},
      due_day        = ${input.dueDay ?? current.dueDay},
      status         = ${input.status ?? current.status},
      note           = ${input.note === undefined ? current.note : input.note},
      updated_at     = now()
    WHERE id = ${debtId} AND user_id = ${userId}
  `;
  return getDebt(userId, debtId, now);
}

export async function deleteDebt(userId: string, debtId: string): Promise<boolean> {
  await ensureDebtSchema();
  const rows = await sql`DELETE FROM debts WHERE id = ${debtId} AND user_id = ${userId} RETURNING id`;
  return rows.length > 0;
}

export interface RegisterPaymentInput {
  amount: number;
  paymentMethod?: string | null;
  note?: string | null;
  occurredAt?: Date;
}

export interface RegisterPaymentResult {
  debt: DebtWithProjection;
  movement: DebtMovement;
  /** Reparto real del abono: lo que hace visible la lógica del banco. */
  split: {
    fees: number;
    interest: number;
    principal: number;
    overpayment: number;
  };
}

/**
 * Registra un abono aplicando la cascada del banco (comisiones → interés →
 * capital) y guardando el reparto en el propio movimiento, para que el historial
 * pueda mostrar mes a mes cuánto se fue en intereses y cuánto bajó la deuda.
 *
 * Si el usuario paga de más, solo se asienta lo que realmente se debía y el
 * sobrante se devuelve para avisarlo: el libro mayor nunca queda en negativo.
 */
export async function registerPayment(
  userId: string,
  debtId: string,
  input: RegisterPaymentInput,
  now: Date = new Date(),
): Promise<RegisterPaymentResult | null> {
  await ensureDebtSchema();

  const rows = await sql`SELECT * FROM debts WHERE id = ${debtId} AND user_id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;

  // Devengar antes de cobrar: el interés del ciclo tiene que estar en el libro
  // para que el reparto de este abono sea el correcto.
  let debt = mapDebt(rows[0] as Record<string, unknown>);
  if (await accrueDueInterest(debt, now)) {
    const fresh = await sql`SELECT * FROM debts WHERE id = ${debtId} LIMIT 1`;
    debt = mapDebt(fresh[0] as Record<string, unknown>);
  }

  const totals = await ledgerTotals(debtId);
  const principalOwed = round2(Math.max(0, totals.balance - totals.interestOwed - totals.feesOwed));
  const requested = round2(safeAmount(input.amount));

  const split = allocatePayment({
    balance: principalOwed,
    accruedInterest: totals.interestOwed,
    pendingFees: totals.feesOwed,
    payment: requested,
  });

  const applied = round2(split.fees + split.interest + split.principal);
  const balanceAfter = round2(Math.max(0, totals.balance - applied));
  const occurredAt = (input.occurredAt ?? now).toISOString();

  const inserted = await sql`
    INSERT INTO debt_movements
      (debt_id, user_id, kind, amount, interest_part, principal_part, fees_part,
       balance_before, balance_after, payment_method, period_key, note, occurred_at)
    VALUES (
      ${debtId}, ${userId}, 'payment', ${applied}, ${split.interest}, ${split.principal}, ${split.fees},
      ${totals.balance}, ${balanceAfter}, ${input.paymentMethod ?? null},
      ${toPeriodKey(input.occurredAt ?? now)}, ${input.note ?? null}, ${occurredAt}
    ) RETURNING *
  `;

  const after = await recomputeBalance(debtId);
  const refreshed = await sql`SELECT * FROM debts WHERE id = ${debtId} LIMIT 1`;
  const finalDebt = mapDebt(refreshed[0] as Record<string, unknown>);

  return {
    debt: decorate(finalDebt, after, now),
    movement: mapMovement(inserted[0] as Record<string, unknown>),
    split: {
      fees: split.fees,
      interest: split.interest,
      principal: split.principal,
      overpayment: split.overpayment,
    },
  };
}

export interface RegisterChargeInput {
  amount: number;
  kind?: Extract<MovementKind, 'charge' | 'fee' | 'adjustment'>;
  note?: string | null;
  occurredAt?: Date;
}

/** Asienta un consumo nuevo, una comisión o un ajuste manual. */
export async function registerCharge(
  userId: string,
  debtId: string,
  input: RegisterChargeInput,
  now: Date = new Date(),
): Promise<DebtWithProjection | null> {
  await ensureDebtSchema();
  const rows = await sql`SELECT id FROM debts WHERE id = ${debtId} AND user_id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;

  const kind = input.kind ?? 'charge';
  // Los ajustes pueden ser negativos (para corregir de menos); el resto no.
  const amount = kind === 'adjustment' ? round2(num(input.amount)) : round2(safeAmount(input.amount));
  const before = await ledgerTotals(debtId);
  const after = round2(Math.max(0, before.balance + amount));

  await sql`
    INSERT INTO debt_movements
      (debt_id, user_id, kind, amount, principal_part, balance_before, balance_after, note, occurred_at)
    VALUES (
      ${debtId}, ${userId}, ${kind}, ${amount}, ${kind === 'charge' ? amount : 0},
      ${before.balance}, ${after}, ${input.note ?? null}, ${(input.occurredAt ?? now).toISOString()}
    )
  `;

  // Un consumo nuevo también sube el capital de referencia del progreso.
  if (kind === 'charge' && amount > 0) {
    await sql`UPDATE debts SET original_amount = original_amount + ${amount} WHERE id = ${debtId}`;
  }

  await recomputeBalance(debtId);
  return getDebt(userId, debtId, now);
}

/**
 * Borra un movimiento y recalcula. Es la forma de deshacer un error: como el
 * saldo se deriva del libro, quitar la fila deja todo consistente sin tocar
 * ningún total a mano.
 */
export async function deleteMovement(
  userId: string,
  debtId: string,
  movementId: string,
  now: Date = new Date(),
): Promise<DebtWithProjection | null> {
  await ensureDebtSchema();
  const deleted = await sql`
    DELETE FROM debt_movements
    WHERE id = ${movementId} AND debt_id = ${debtId} AND user_id = ${userId}
    RETURNING id, kind, amount
  `;
  if (deleted.length === 0) return null;

  const row = deleted[0] as Record<string, unknown>;
  if (String(row.kind) === 'charge') {
    await sql`
      UPDATE debts SET original_amount = GREATEST(0, original_amount - ${num(row.amount)})
      WHERE id = ${debtId}
    `;
  }

  await recomputeBalance(debtId);
  return getDebt(userId, debtId, now);
}
