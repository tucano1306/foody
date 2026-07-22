/**
 * finance-engine.ts — el cerebro del Plan Financiero.
 *
 * Funciones PURAS (sin SQL, sin fechas implícitas fuera de `now`) que toman una
 * foto de la situación del usuario — ingresos, pagos fijos, gasto de super y
 * metas — y devuelven un plan: cuánto queda libre cada mes, cuánto hay que
 * apartar por meta, si la fecha objetivo es alcanzable y qué consejos concretos
 * dar para lograrlo.
 *
 * Todo el dinero se maneja en la moneda del usuario (USD por defecto) y se
 * redondea a 2 decimales solo al salir, para no arrastrar error de flotante.
 *
 * Se prueba en finance-engine.test.ts; la capa de datos vive en finance-data.ts.
 */

import type { BaselineSource, GroceryInsight } from './grocery-insights';

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type GoalKind = 'trip' | 'debt' | 'project' | 'purchase' | 'emergency';
export type GoalStatus = 'active' | 'paused' | 'done';
export type IncomeFrequency = 'monthly' | 'biweekly' | 'weekly' | 'yearly' | 'one_time';

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  isActive: boolean;
  note: string | null;
}

export interface FinanceGoal {
  id: string;
  name: string;
  emoji: string;
  kind: GoalKind;
  targetAmount: number;
  savedAmount: number;
  /** YYYY-MM-DD o null si es una meta sin fecha límite. */
  targetDate: string | null;
  /** 1 = máxima prioridad, 2 = normal, 3 = cuando se pueda. */
  priority: number;
  /** Aporte mensual fijado a mano por el usuario (manda sobre el calculado). */
  monthlyOverride: number | null;
  status: GoalStatus;
  note: string | null;
  createdAt: string;
}

/** Un pago mensual recurrente ya registrado en la sección Pagos. */
export interface FixedPaymentInput {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  isPaidThisMonth: boolean;
  missedMonths: number;
  accumulatedDebt: number;
}

export interface PlanInput {
  incomes: readonly IncomeSource[];
  goals: readonly FinanceGoal[];
  fixedPayments: readonly FixedPaymentInput[];
  /**
   * Estimado mensual de super que resta el plan. Sale de las compras reales
   * (`groceries.baseline`); solo cae al límite del presupuesto cuando todavía
   * no hay tickets registrados.
   */
  groceriesMonthly: number;
  groceriesSource: BaselineSource;
  groceriesSpentThisMonth: number;
  /** Análisis de las compras registradas — alimenta los consejos de super. */
  groceries?: GroceryInsight;
  /** Dinero extra mensual para simular escenarios ("¿y si aporto $200 más?"). */
  extraMonthly?: number;
  now?: Date;
}

// ─── Tipos de salida ──────────────────────────────────────────────────────────

export interface CashFlow {
  monthlyIncome: number;
  fixedPayments: number;
  groceriesEstimate: number;
  /** Ingreso − pagos fijos − super (+ extra simulado). Puede ser negativo. */
  available: number;
  /** Parte de `available` que el plan reserva para ponerse al día con deudas. */
  debtCatchUp: number;
  /** Lo que queda para metas después de la reserva de deuda. */
  goalsBudget: number;
  /** Suma efectivamente asignada a metas. */
  allocatedToGoals: number;
  /** Colchón que sobra tras cubrir metas. */
  unallocated: number;
  /** available / ingreso, 0–1. 0 si no hay ingreso registrado. */
  savingsRate: number;
  extraMonthly: number;
}

export type Feasibility =
  | 'done'        // ya se juntó el objetivo
  | 'on_track'    // el ritmo asignado alcanza con holgura
  | 'tight'       // alcanza, pero exige casi todo lo disponible
  | 'at_risk'     // el ritmo asignado NO alcanza para la fecha
  | 'overdue'     // la fecha ya pasó y falta dinero
  | 'no_date';    // sin fecha límite

export interface GoalProjection {
  goalId: string;
  name: string;
  emoji: string;
  kind: GoalKind;
  priority: number;
  targetAmount: number;
  savedAmount: number;
  remaining: number;
  percentComplete: number;
  targetDate: string | null;
  daysLeft: number | null;
  monthsLeft: number | null;
  /** Lo que habría que apartar cada mes para llegar a tiempo. */
  requiredMonthly: number;
  requiredWeekly: number;
  requiredDaily: number;
  /** Lo que el plan puede asignarle realmente este mes. */
  allocatedMonthly: number;
  /** requiredMonthly − allocatedMonthly (0 si alcanza). */
  shortfallMonthly: number;
  /** Fecha estimada de logro al ritmo asignado (YYYY-MM-DD) o null. */
  projectedDate: string | null;
  /** Meses de retraso frente a la fecha objetivo al ritmo actual. */
  monthsLate: number;
  feasibility: Feasibility;
  status: GoalStatus;
}

export interface DebtOverview {
  /** Deuda acumulada de pagos vencidos sin registrar. */
  overdueTotal: number;
  overdueCount: number;
  /** Pagos atrasados, el de menor deuda primero (método bola de nieve). */
  payoffOrder: { id: string; name: string; debt: number; missedMonths: number }[];
  monthlyCatchUp: number;
  monthsToClear: number | null;
  /** Metas de tipo deuda registradas a mano. */
  goalDebtTotal: number;
}

export type AdviceTone = 'critical' | 'warning' | 'good' | 'idea' | 'info';

export interface AdviceAction {
  label: string;
  kind: 'add_income' | 'add_goal' | 'open_payments' | 'open_budget' | 'open_trips' | 'edit_goal' | 'contribute';
  goalId?: string;
}

export interface Advice {
  id: string;
  tone: AdviceTone;
  icon: string;
  title: string;
  body: string;
  action?: AdviceAction;
}

export interface FinancePlan {
  cashFlow: CashFlow;
  goals: GoalProjection[];
  debts: DebtOverview;
  advice: Advice[];
  /** Salud general 0–100: mezcla de flujo libre, deuda y metas en riesgo. */
  healthScore: number;
  currency: string;
  generatedAt: string;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export const MS_PER_DAY = 86_400_000;
/** Promedio real de días por mes (365.25 / 12) — evita el sesgo de usar 30. */
export const DAYS_PER_MONTH = 30.4375;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** "2026-10-15" → Date local al final de ese día (la meta vale todo el día). */
export function parseTargetDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Días completos que faltan para la fecha (0 = es hoy, negativo = ya pasó). */
export function daysUntil(target: string, now: Date = new Date()): number | null {
  const end = parseTargetDate(target);
  if (!end) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((end.getTime() - startOfToday) / MS_PER_DAY - 0.5);
}

/** Ingreso mensual equivalente de una fuente según su frecuencia. */
export function monthlyEquivalent(amount: number, frequency: IncomeFrequency): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (frequency) {
    case 'weekly':   return (amount * 52) / 12;
    case 'biweekly': return (amount * 26) / 12;
    case 'yearly':   return amount / 12;
    case 'one_time': return 0;
    case 'monthly':
    default:         return amount;
  }
}

export function totalMonthlyIncome(incomes: readonly IncomeSource[]): number {
  return incomes
    .filter((i) => i.isActive)
    .reduce((sum, i) => sum + monthlyEquivalent(i.amount, i.frequency), 0);
}

/** Meses (redondeando hacia arriba) para juntar `remaining` aportando `monthly`. */
export function monthsToReach(remaining: number, monthly: number): number | null {
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}

/** Suma `months` meses a `from`, sin desbordar a otro mes por días 29–31. */
export function addMonths(from: Date, months: number): Date {
  const day = from.getDate();
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

// ─── Motor ────────────────────────────────────────────────────────────────────

/** Orden de atención: prioridad, luego la fecha más cercana, luego lo más chico. */
function compareGoals(a: GoalProjection, b: GoalProjection): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
  const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return aDays - bDays;
  return a.remaining - b.remaining;
}

/** Horizonte por defecto (meses) para metas sin fecha límite. */
const DEFAULT_HORIZON_MONTHS = 12;

function projectGoal(goal: FinanceGoal, now: Date): GoalProjection {
  const targetAmount = Math.max(0, goal.targetAmount);
  const savedAmount = clamp(goal.savedAmount, 0, Number.MAX_SAFE_INTEGER);
  const remaining = Math.max(0, targetAmount - savedAmount);
  const percentComplete = targetAmount > 0 ? clamp((savedAmount / targetAmount) * 100, 0, 100) : 0;

  const days = goal.targetDate ? daysUntil(goal.targetDate, now) : null;
  const daysLeft = days === null ? null : days;
  const monthsLeft = daysLeft === null ? null : daysLeft / DAYS_PER_MONTH;

  // Con fecha: reparte lo que falta en el tiempo que queda. Sin fecha: horizonte
  // de un año para que la meta siga teniendo un ritmo sugerido concreto.
  let requiredMonthly: number;
  if (remaining === 0) {
    requiredMonthly = 0;
  } else if (monthsLeft === null) {
    requiredMonthly = remaining / DEFAULT_HORIZON_MONTHS;
  } else if (monthsLeft <= 0) {
    requiredMonthly = remaining; // la fecha ya pasó: hace falta todo, ya
  } else {
    requiredMonthly = remaining / monthsLeft;
  }

  const effectiveDays = daysLeft !== null && daysLeft > 0 ? daysLeft : null;

  return {
    goalId: goal.id,
    name: goal.name,
    emoji: goal.emoji,
    kind: goal.kind,
    priority: goal.priority,
    targetAmount: round2(targetAmount),
    savedAmount: round2(savedAmount),
    remaining: round2(remaining),
    percentComplete: round2(percentComplete),
    targetDate: goal.targetDate,
    daysLeft,
    monthsLeft: monthsLeft === null ? null : round2(monthsLeft),
    requiredMonthly: round2(requiredMonthly),
    requiredWeekly: round2(effectiveDays ? (remaining / effectiveDays) * 7 : requiredMonthly / 4.345),
    requiredDaily: round2(effectiveDays ? remaining / effectiveDays : requiredMonthly / DAYS_PER_MONTH),
    allocatedMonthly: 0,
    shortfallMonthly: 0,
    projectedDate: null,
    monthsLate: 0,
    feasibility: 'no_date',
    status: goal.status,
  };
}

/** Reparte `goalsBudget` entre las metas activas por orden de atención. */
function allocate(projections: GoalProjection[], goalsBudget: number, overrides: Map<string, number | null>): number {
  let pool = Math.max(0, goalsBudget);
  for (const p of projections) {
    if (p.status !== 'active' || p.remaining <= 0) continue;
    const override = overrides.get(p.goalId);
    const want = override != null && override > 0 ? override : p.requiredMonthly;
    const alloc = Math.min(want, pool);
    p.allocatedMonthly = round2(alloc);
    pool = round2(pool - alloc);
  }
  return pool;
}

/** A partir de aquí una meta se considera "justa": se come casi todo el margen. */
const TIGHT_RATIO = 0.85;

function finishProjection(p: GoalProjection, now: Date, goalsBudget: number): void {
  p.shortfallMonthly = round2(Math.max(0, p.requiredMonthly - p.allocatedMonthly));

  const months = monthsToReach(p.remaining, p.allocatedMonthly);
  p.projectedDate = months === null ? null : toDateKey(addMonths(now, months));

  if (p.remaining <= 0) {
    p.feasibility = 'done';
    p.monthsLate = 0;
    return;
  }
  if (p.targetDate === null) {
    p.feasibility = 'no_date';
    return;
  }
  if ((p.daysLeft ?? 0) <= 0) {
    p.feasibility = 'overdue';
    return;
  }
  if (months !== null && p.monthsLeft !== null) {
    p.monthsLate = round2(Math.max(0, months - Math.ceil(p.monthsLeft)));
  } else {
    p.monthsLate = 0;
  }
  if (p.allocatedMonthly + 0.01 >= p.requiredMonthly) {
    // Alcanza; "justa" si esa cuota se lleva casi todo el dinero libre del mes,
    // porque entonces cualquier imprevisto la descarrila.
    const share = goalsBudget > 0 ? p.requiredMonthly / goalsBudget : 1;
    p.feasibility = share > TIGHT_RATIO ? 'tight' : 'on_track';
  } else {
    p.feasibility = 'at_risk';
  }
}

function buildDebtOverview(
  fixedPayments: readonly FixedPaymentInput[],
  goals: readonly FinanceGoal[],
  available: number,
): DebtOverview {
  const overdue = fixedPayments.filter((p) => p.accumulatedDebt > 0);
  const overdueTotal = round2(overdue.reduce((s, p) => s + p.accumulatedDebt, 0));

  // Bola de nieve: primero la deuda más pequeña — se liquida rápido y el
  // impulso de tacharla es lo que sostiene el plan.
  const payoffOrder = [...overdue]
    .sort((a, b) => a.accumulatedDebt - b.accumulatedDebt)
    .map((p) => ({ id: p.id, name: p.name, debt: round2(p.accumulatedDebt), missedMonths: p.missedMonths }));

  // Ponerse al día en ~3 meses sin canibalizar más del 40% del dinero libre.
  const ideal = overdueTotal / 3;
  const cap = Math.max(0, available) * 0.4;
  const monthlyCatchUp = overdueTotal > 0 ? round2(Math.min(ideal, cap)) : 0;
  const monthsToClear = monthlyCatchUp > 0 ? Math.ceil(overdueTotal / monthlyCatchUp) : null;

  const goalDebtTotal = round2(
    goals
      .filter((g) => g.kind === 'debt' && g.status === 'active')
      .reduce((s, g) => s + Math.max(0, g.targetAmount - g.savedAmount), 0),
  );

  return {
    overdueTotal,
    overdueCount: overdue.length,
    payoffOrder,
    monthlyCatchUp,
    monthsToClear,
    goalDebtTotal,
  };
}

/**
 * Salud financiera 0–100. Tres tercios: flujo libre sobre el ingreso, ausencia
 * de deuda vencida y metas que van a tiempo.
 */
function computeHealthScore(cash: CashFlow, goals: GoalProjection[], debts: DebtOverview): number {
  if (cash.monthlyIncome <= 0) return 0;

  const flowScore = clamp(cash.savingsRate / 0.2, 0, 1) * 40; // 20% de ahorro = pleno
  const debtScore = debts.overdueTotal <= 0
    ? 30
    : clamp(1 - debts.overdueTotal / Math.max(cash.monthlyIncome, 1), 0, 1) * 30;

  const tracked = goals.filter((g) => g.status === 'active' && g.remaining > 0);
  const healthyGoals = tracked.filter((g) => g.feasibility === 'on_track' || g.feasibility === 'tight').length;
  const goalScore = tracked.length === 0 ? 30 : (healthyGoals / tracked.length) * 30;

  return Math.round(clamp(flowScore + debtScore + goalScore, 0, 100));
}

// ─── Consejos ─────────────────────────────────────────────────────────────────

const TONE_WEIGHT: Record<AdviceTone, number> = { critical: 0, warning: 1, idea: 2, good: 3, info: 4 };

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function prettyDate(key: string): string {
  const d = parseTargetDate(key);
  if (!d) return key;
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function adviceForCashFlow(input: PlanInput, cash: CashFlow, out: Advice[]): void {
  if (cash.monthlyIncome <= 0) {
    out.push({
      id: 'no-income',
      tone: 'warning',
      icon: '💼',
      title: 'Registra tus ingresos para empezar',
      body: 'Sin ingresos cargados no puedo calcular cuánto te queda libre ni si tus metas son alcanzables. Agrega tu sueldo y cualquier entrada extra (freelance, renta, bonos).',
      action: { label: 'Agregar ingreso', kind: 'add_income' },
    });
    return;
  }

  if (cash.available < 0) {
    const deficit = Math.abs(cash.available);
    out.push({
      id: 'negative-flow',
      tone: 'critical',
      icon: '🚨',
      title: `Gastas ${money(deficit)} más de lo que ingresas`,
      body: `Tus pagos fijos (${money(cash.fixedPayments)}) más el super (${money(cash.groceriesEstimate)}) superan tu ingreso mensual de ${money(cash.monthlyIncome)}. Antes de ahorrar para cualquier meta hay que cerrar ese hueco: revisa qué pago fijo puedes bajar o cancelar, y recorta el super.`,
      action: { label: 'Revisar pagos fijos', kind: 'open_payments' },
    });
    return;
  }

  if (cash.savingsRate < 0.1) {
    out.push({
      id: 'low-savings-rate',
      tone: 'warning',
      icon: '📉',
      title: `Solo te queda libre el ${Math.round(cash.savingsRate * 100)}% de tu ingreso`,
      body: `Después de pagos fijos y super te sobran ${money(cash.available)} al mes. Lo sano es 20% (${money(cash.monthlyIncome * 0.2)}). Bajar el super un 15% te daría ${money(cash.groceriesEstimate * 0.15)} extra cada mes.`,
      action: { label: 'Ajustar presupuesto', kind: 'open_budget' },
    });
  } else if (cash.savingsRate >= 0.2) {
    out.push({
      id: 'healthy-savings-rate',
      tone: 'good',
      icon: '🌱',
      title: `Tu tasa de ahorro es del ${Math.round(cash.savingsRate * 100)}%`,
      body: `Te quedan ${money(cash.available)} libres cada mes — por encima del 20% recomendado. Ese margen es justo lo que hace que tus metas lleguen a tiempo.`,
    });
  }

}

function adviceForDebt(cash: CashFlow, debts: DebtOverview, out: Advice[]): void {
  if (debts.overdueTotal <= 0) return;

  const first = debts.payoffOrder[0];
  const plan = debts.monthsToClear
    ? `Con ${money(debts.monthlyCatchUp)} al mes lo liquidas en ${debts.monthsToClear} ${debts.monthsToClear === 1 ? 'mes' : 'meses'}.`
    : 'No queda dinero libre para abonarlo: primero hay que liberar flujo bajando gastos.';

  out.push({
    id: 'overdue-debt',
    tone: 'critical',
    icon: '🔴',
    title: `Tienes ${money(debts.overdueTotal)} en pagos atrasados`,
    body: `${debts.overdueCount} ${debts.overdueCount === 1 ? 'pago acumula meses' : 'pagos acumulan meses'} sin registrar. Esto va antes que cualquier meta: los atrasos suelen generar recargos e intereses que ninguna meta compensa. ${plan}`,
    action: { label: 'Ver pagos', kind: 'open_payments' },
  });

  if (first && debts.payoffOrder.length > 1) {
    const order = debts.payoffOrder.map((d) => `${d.name} (${money(d.debt)})`).join(' → ');
    out.push({
      id: 'snowball-order',
      tone: 'idea',
      icon: '❄️',
      title: 'Orden sugerido: bola de nieve',
      body: `Ataca primero la deuda más pequeña y sigue en orden: ${order}. Cada una que tachas libera su cuota mensual y acelera la siguiente. Empieza por ${first.name}: son ${money(first.debt)}.`,
      action: { label: 'Ver pagos', kind: 'open_payments' },
    });
  }

  if (cash.goalsBudget <= 0 && cash.available > 0) {
    out.push({
      id: 'debt-eats-budget',
      tone: 'warning',
      icon: '⏸️',
      title: 'Tus metas están en pausa mientras pagas atrasos',
      body: `Todo el dinero libre (${money(cash.available)}) se está yendo a ponerte al día. Es lo correcto por ahora — en cuanto liquides los atrasos ese monto pasa entero a tus metas.`,
    });
  }
}

function adviceForGoal(goal: GoalProjection, cash: CashFlow, input: PlanInput, out: Advice[]): void {
  const fecha = goal.targetDate ? prettyDate(goal.targetDate) : null;

  if (goal.feasibility === 'done') {
    out.push({
      id: `goal-done-${goal.goalId}`,
      tone: 'good',
      icon: '🎉',
      title: `¡${goal.name} está cubierta!`,
      body: `Ya tienes los ${money(goal.targetAmount)}. Marca la meta como lograda para liberar ${money(goal.allocatedMonthly || goal.requiredMonthly)} al mes hacia tus otras metas.`,
      action: { label: 'Marcar lograda', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'overdue') {
    out.push({
      id: `goal-overdue-${goal.goalId}`,
      tone: 'warning',
      icon: '📅',
      title: `${goal.name}: la fecha ya pasó`,
      body: `Faltaron ${money(goal.remaining)} para el ${fecha}. Ponle una fecha nueva realista: al ritmo de ${money(goal.allocatedMonthly || cash.goalsBudget)} al mes lo lograrías ${goal.projectedDate ? `hacia el ${prettyDate(goal.projectedDate)}` : 'en cuanto liberes dinero'}.`,
      action: { label: 'Ajustar fecha', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'at_risk') {
    const falta = goal.shortfallMonthly;
    const recorteSuper = input.groceriesMonthly > 0
      ? Math.min(1, falta / input.groceriesMonthly)
      : 0;
    const opciones: string[] = [];
    if (recorteSuper > 0 && recorteSuper <= 0.35) {
      opciones.push(`recortar el super un ${Math.ceil(recorteSuper * 100)}% (${money(falta)}/mes)`);
    }
    if (goal.projectedDate) {
      opciones.push(`mover la fecha al ${prettyDate(goal.projectedDate)}`);
    }
    opciones.push(`bajar la meta a ${money(goal.savedAmount + goal.allocatedMonthly * (goal.monthsLeft ?? 1))}`);
    opciones.push(`sumar ${money(falta)} de ingreso extra al mes`);

    out.push({
      id: `goal-risk-${goal.goalId}`,
      tone: 'warning',
      icon: '⚠️',
      title: `${goal.name} no llega a tiempo`,
      body: `Necesitas ${money(goal.requiredMonthly)} al mes hasta el ${fecha} y el plan solo puede darle ${money(goal.allocatedMonthly)}. Te faltan ${money(falta)} cada mes. Opciones: ${opciones.join('; ')}.`,
      action: { label: 'Ajustar meta', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'tight') {
    out.push({
      id: `goal-tight-${goal.goalId}`,
      tone: 'idea',
      icon: '🎯',
      title: `${goal.name} va justa`,
      body: `Llegas al ${fecha}, pero se lleva casi todo tu margen (${money(goal.requiredMonthly)} de ${money(cash.goalsBudget)} disponibles). Cualquier gasto imprevisto la descarrila: intenta adelantar ${money(goal.requiredWeekly)} cada semana en vez de esperar al fin de mes.`,
      action: { label: 'Registrar aporte', kind: 'contribute', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'on_track' && goal.daysLeft !== null) {
    out.push({
      id: `goal-ok-${goal.goalId}`,
      tone: 'good',
      icon: goal.emoji || '✅',
      title: `${goal.name} va en camino`,
      body: `Apartando ${money(goal.requiredMonthly)} al mes — o ${money(goal.requiredWeekly)} por semana — tienes los ${money(goal.targetAmount)} para el ${fecha}. Faltan ${goal.daysLeft} días y llevas el ${Math.round(goal.percentComplete)}%.`,
      action: { label: 'Registrar aporte', kind: 'contribute', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'no_date') {
    out.push({
      id: `goal-nodate-${goal.goalId}`,
      tone: 'info',
      icon: '🗓️',
      title: `Ponle fecha a ${goal.name}`,
      body: `Sin fecha límite no hay ritmo que seguir. Con ${money(goal.allocatedMonthly || goal.requiredMonthly)} al mes la lograrías ${goal.projectedDate ? `hacia el ${prettyDate(goal.projectedDate)}` : 'cuando liberes dinero libre'}.`,
      action: { label: 'Poner fecha', kind: 'edit_goal', goalId: goal.goalId },
    });
  }
}

function adviceForSurplus(cash: CashFlow, goals: GoalProjection[], out: Advice[]): void {
  if (cash.unallocated <= 1) return;

  const priority = goals.find((g) => g.status === 'active' && g.remaining > 0);
  if (!priority) {
    out.push({
      id: 'surplus-no-goals',
      tone: 'idea',
      icon: '✨',
      title: `Te sobran ${money(cash.unallocated)} al mes sin destino`,
      body: 'Ese dinero sin nombre es el que se evapora. Créale una meta: un fondo de emergencia de 3 meses de gastos es el mejor primer objetivo.',
      action: { label: 'Crear meta', kind: 'add_goal' },
    });
    return;
  }

  const nuevosMeses = monthsToReach(priority.remaining, priority.allocatedMonthly + cash.unallocated);
  const mesesActuales = monthsToReach(priority.remaining, priority.allocatedMonthly);
  const ahorro = mesesActuales !== null && nuevosMeses !== null ? mesesActuales - nuevosMeses : null;

  out.push({
    id: 'surplus-boost',
    tone: 'idea',
    icon: '🚀',
    title: `Tienes ${money(cash.unallocated)} libres cada mes`,
    body: ahorro && ahorro > 0
      ? `Si los mandas a ${priority.name} adelantas la meta ${ahorro} ${ahorro === 1 ? 'mes' : 'meses'}. Programa la transferencia el mismo día que cobras: lo que no se aparta primero, se gasta.`
      : `Mándalos a ${priority.name} o crea un fondo de emergencia. Programa la transferencia el mismo día que cobras: lo que no se aparta primero, se gasta.`,
    action: { label: 'Registrar aporte', kind: 'contribute', goalId: priority.goalId },
  });
}

/** Meses que se adelanta una meta si recibe `extra` más cada mes. */
export function monthsSavedWith(goal: GoalProjection, extra: number): number {
  if (extra <= 0 || goal.remaining <= 0) return 0;
  const before = monthsToReach(goal.remaining, goal.allocatedMonthly);
  const after = monthsToReach(goal.remaining, goal.allocatedMonthly + extra);
  if (after === null) return 0;
  if (before === null) return 0; // sin ritmo previo no hay "adelanto" que medir
  return Math.max(0, before - after);
}

/** Traduce un ahorro mensual en avance concreto sobre la meta prioritaria. */
function impactOnGoal(goals: GoalProjection[], extra: number): string {
  const target = goals.find((g) => g.status === 'active' && g.remaining > 0);
  if (!target || extra <= 0) return '';
  const saved = monthsSavedWith(target, extra);
  if (saved > 0) return ` Mandándolos a «${target.name}» la adelantas ${saved} ${saved === 1 ? 'mes' : 'meses'}.`;
  return ` Son ${money(extra)} más al mes para «${target.name}».`;
}

/**
 * Consejos de super basados en las compras registradas: ritmo del mes,
 * tendencia contra el promedio y la categoría que más pesa.
 */
function adviceForGroceries(input: PlanInput, cash: CashFlow, goals: GoalProjection[], out: Advice[]): void {
  const g = input.groceries;

  if (!g || (g.monthsWithData === 0 && g.spentThisMonth === 0)) {
    // Sin ingresos el consejo prioritario es otro; no saturar el arranque.
    if (cash.monthlyIncome <= 0) return;
    out.push({
      id: 'grocery-no-purchases',
      tone: 'info',
      icon: '🧾',
      title: 'Registra tus compras y el plan se afina solo',
      body: 'Todavía no hay tickets cargados, así que el super se estima con tu límite. En cuanto registres compras uso tu gasto real: el ritmo del mes, la tendencia y las categorías que más pesan.',
      action: { label: 'Ir a Presupuesto', kind: 'open_budget' },
    });
    return;
  }

  const enRiesgo = goals.some((p) => p.feasibility === 'at_risk' || p.feasibility === 'tight');

  // 1. Ritmo del mes contra el límite declarado.
  if (g.limit > 0 && g.overLimit > 1) {
    out.push({
      id: 'grocery-pace-over-limit',
      tone: 'warning',
      icon: '🛒',
      title: `Vas a cerrar el super en ${money(g.projectedMonthEnd)}`,
      body: `Llevas ${money(g.spentThisMonth)} en ${g.daysElapsed} días (${money(g.dailyPace)} diarios) y tu límite es ${money(g.limit)}: te pasarías ${money(g.overLimit)}. Ese exceso sale del dinero de tus metas.${impactOnGoal(goals, g.overLimit)}`,
      action: { label: 'Ver presupuesto', kind: 'open_budget' },
    });
  } else if (g.limit > 0 && g.overLimit < -1 && g.spentThisMonth > 0) {
    const sobrante = Math.abs(g.overLimit);
    // Sin meta activa no hay dónde aportar: se invita a crear una.
    const destino = goals.find((p) => p.status === 'active' && p.remaining > 0);
    out.push({
      id: 'grocery-under-limit',
      tone: 'good',
      icon: '🥬',
      title: `Vas ${money(sobrante)} por debajo de tu límite de super`,
      body: `A este ritmo cierras el mes en ${money(g.projectedMonthEnd)} contra un límite de ${money(g.limit)}. Ese sobrante no es tuyo hasta que lo apartas.${destino ? impactOnGoal(goals, sobrante) : ' Crea una meta y ese dinero deja de evaporarse.'}`,
      action: destino
        ? { label: 'Registrar aporte', kind: 'contribute', goalId: destino.goalId }
        : { label: 'Crear meta', kind: 'add_goal' },
    });
  }

  // 2. Tendencia contra el promedio histórico.
  if (g.trendPct !== null && g.monthsWithData >= 2) {
    const diff = Math.abs(g.projectedMonthEnd - g.avgMonthly);
    if (g.trendPct >= 15) {
      const culpable = g.biggestMover
        ? ` Lo que más subió es ${g.biggestMover.category}: ${money(g.biggestMover.currentMonth)} contra ${money(g.biggestMover.prevMonth)} el mes pasado.`
        : '';
      out.push({
        id: 'grocery-trend-up',
        tone: 'warning',
        icon: '📈',
        title: `Tu super va ${Math.round(g.trendPct)}% arriba de tu promedio`,
        body: `Proyectas ${money(g.projectedMonthEnd)} frente a los ${money(g.avgMonthly)} que gastas normalmente — ${money(diff)} de más.${culpable} Volver a tu promedio le devuelve ese dinero a tus metas.`,
        action: { label: 'Ver presupuesto', kind: 'open_budget' },
      });
    } else if (g.trendPct <= -15) {
      out.push({
        id: 'grocery-trend-down',
        tone: 'good',
        icon: '📉',
        title: `Estás gastando ${Math.abs(Math.round(g.trendPct))}% menos en super`,
        body: `Proyectas ${money(g.projectedMonthEnd)} contra tu promedio de ${money(g.avgMonthly)}: ${money(diff)} liberados este mes.${impactOnGoal(goals, diff)}`,
      });
    }
  }

  // 3. La categoría que más pesa — solo si hay metas que necesitan aire.
  const top = g.categories[0];
  if (enRiesgo && top && top.share >= 20 && top.currentMonth > 0) {
    const recorte = top.currentMonth * 0.15;
    out.push({
      id: 'grocery-category-lever',
      tone: 'idea',
      icon: '🥑',
      title: `${top.category} se lleva el ${Math.round(top.share)}% de tu super`,
      body: `Son ${money(top.currentMonth)} este mes. Recortar un 15% ahí libera ${money(recorte)} mensuales — ${money(recorte * 12)} al año — sin tocar el resto de la despensa: marca propia, comprar por peso y revisar el inventario antes de salir.${impactOnGoal(goals, recorte)}`,
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
  }

  // 4. Muchas visitas al super: cada viaje extra es compra impulsiva.
  if (enRiesgo && g.tripsThisMonth >= 8 && g.spentThisMonth > 0) {
    const porViaje = g.spentThisMonth / g.tripsThisMonth;
    out.push({
      id: 'grocery-trip-frequency',
      tone: 'idea',
      icon: '🚗',
      title: `Llevas ${g.tripsThisMonth} visitas al super este mes`,
      body: `Cada visita promedia ${money(porViaje)}. Concentrar las compras en una vez por semana suele recortar el gasto sin comer distinto — el ticket sube, pero el total del mes baja porque desaparece la compra de paso.`,
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
  }
}

export function buildAdvice(
  input: PlanInput,
  cash: CashFlow,
  goals: GoalProjection[],
  debts: DebtOverview,
): Advice[] {
  const out: Advice[] = [];

  adviceForCashFlow(input, cash, out);
  adviceForDebt(cash, debts, out);

  const active = goals.filter((g) => g.status === 'active');
  if (active.length === 0) {
    out.push({
      id: 'no-goals',
      tone: 'info',
      icon: '🎯',
      title: 'Dime qué quieres lograr',
      body: 'Crea tu primera meta — un viaje, saldar una deuda, un proyecto — con su monto y su fecha. A partir de ahí calculo cuánto apartar cada mes y te aviso si te desvías.',
      action: { label: 'Crear meta', kind: 'add_goal' },
    });
  } else {
    for (const goal of active) adviceForGoal(goal, cash, input, out);
  }

  adviceForGroceries(input, cash, goals, out);
  adviceForSurplus(cash, goals, out);

  return out.sort((a, b) => TONE_WEIGHT[a.tone] - TONE_WEIGHT[b.tone]);
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export function buildFinancePlan(input: PlanInput): FinancePlan {
  const now = input.now ?? new Date();
  const extraMonthly = Math.max(0, input.extraMonthly ?? 0);

  const monthlyIncome = totalMonthlyIncome(input.incomes);
  const fixedPayments = input.fixedPayments.reduce((s, p) => s + Math.max(0, p.amount), 0);
  const groceriesEstimate = Math.max(0, input.groceriesMonthly);

  const available = monthlyIncome - fixedPayments - groceriesEstimate + extraMonthly;

  const debts = buildDebtOverview(input.fixedPayments, input.goals, available);
  const goalsBudget = Math.max(0, available - debts.monthlyCatchUp);

  const projections = input.goals.map((g) => projectGoal(g, now)).sort(compareGoals);
  const overrides = new Map(input.goals.map((g) => [g.id, g.monthlyOverride]));
  const unallocated = allocate(projections, goalsBudget, overrides);
  for (const p of projections) finishProjection(p, now, goalsBudget);

  const allocatedToGoals = round2(projections.reduce((s, p) => s + p.allocatedMonthly, 0));

  const cashFlow: CashFlow = {
    monthlyIncome: round2(monthlyIncome),
    fixedPayments: round2(fixedPayments),
    groceriesEstimate: round2(groceriesEstimate),
    available: round2(available),
    debtCatchUp: debts.monthlyCatchUp,
    goalsBudget: round2(goalsBudget),
    allocatedToGoals,
    unallocated: round2(Math.max(0, unallocated)),
    savingsRate: monthlyIncome > 0 ? round2(clamp(available / monthlyIncome, -10, 1)) : 0,
    extraMonthly: round2(extraMonthly),
  };

  const advice = buildAdvice(input, cashFlow, projections, debts);
  const healthScore = computeHealthScore(cashFlow, projections, debts);

  return {
    cashFlow,
    goals: projections,
    debts,
    advice,
    healthScore,
    currency: 'USD',
    generatedAt: now.toISOString(),
  };
}

/**
 * Simulación "¿y si…?": recalcula el plan con dinero extra al mes.
 * La usa el deslizador de escenarios sin tocar nada en la base de datos.
 */
export function simulatePlan(input: PlanInput, extraMonthly: number): FinancePlan {
  return buildFinancePlan({ ...input, extraMonthly });
}
