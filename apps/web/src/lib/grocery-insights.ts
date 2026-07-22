/**
 * grocery-insights.ts — lee las compras reales y las convierte en la cifra de
 * super que usa el Plan Financiero.
 *
 * El límite del presupuesto es una intención; lo que de verdad sale de la
 * cuenta cada mes son los tickets. Si el plan resta el límite ($500) mientras
 * el usuario gasta $700, las metas se ven alcanzables y luego fallan. Aquí se
 * calcula la cifra realista a partir del historial y del ritmo del mes en curso.
 *
 * Módulo PURO (sin SQL) para poder recalcular en el navegador y probarlo;
 * las consultas viven en finance-data.ts.
 */

export interface MonthTotal {
  month: string; // YYYY-MM
  total: number;
  trips: number;
}

export interface CategorySpendInput {
  category: string;
  currentMonth: number;
  prevMonth: number;
}

export interface CategorySpend extends CategorySpendInput {
  /** Cambio vs el mes pasado, null si el mes pasado no hubo gasto. */
  deltaPct: number | null;
  /** Parte del gasto del mes que se lleva esta categoría (0–100). */
  share: number;
}

export interface StoreSpend {
  name: string;
  total: number;
  trips: number;
}

export interface GroceryInsightInput {
  /** Totales por mes incluyendo el actual (mismo cálculo que Presupuesto). */
  monthlyTotals: readonly MonthTotal[];
  categories: readonly CategorySpendInput[];
  stores: readonly StoreSpend[];
  /** Límite mensual configurado en Presupuesto (0 = sin límite). */
  limit: number;
  now?: Date;
}

/** De dónde sale la cifra de super que resta el plan. */
export type BaselineSource = 'pace' | 'average' | 'limit' | 'none';

export interface GroceryInsight {
  spentThisMonth: number;
  tripsThisMonth: number;
  daysElapsed: number;
  daysInMonth: number;
  dailyPace: number;
  /** Gasto estimado al cierre del mes si sigue este ritmo. */
  projectedMonthEnd: number;
  avgMonthly: number;
  lastMonth: number;
  monthsWithData: number;
  limit: number;
  /** La cifra que el plan resta como gasto de super. */
  baseline: number;
  baselineSource: BaselineSource;
  /** Proyección − límite. Positivo = se va a pasar. */
  overLimit: number;
  /** Proyección vs promedio histórico, en %. null si no hay historial. */
  trendPct: number | null;
  categories: CategorySpend[];
  /** Categoría que más subió vs el mes pasado, si subió. */
  biggestMover: CategorySpend | null;
  topStores: StoreSpend[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const EMPTY_GROCERY_INSIGHT: GroceryInsight = {
  spentThisMonth: 0,
  tripsThisMonth: 0,
  daysElapsed: 1,
  daysInMonth: 30,
  dailyPace: 0,
  projectedMonthEnd: 0,
  avgMonthly: 0,
  lastMonth: 0,
  monthsWithData: 0,
  limit: 0,
  baseline: 0,
  baselineSource: 'none',
  overLimit: 0,
  trendPct: null,
  categories: [],
  biggestMover: null,
  topStores: [],
};

/** Días de mes necesarios para que proyectar el cierre signifique algo. */
const MIN_DAYS_FOR_PACE = 7;
/** Meses cerrados necesarios para que el promedio sea representativo. */
const MIN_MONTHS_FOR_HISTORY = 2;

/**
 * Elige la cifra de super del plan combinando dos señales imperfectas.
 *
 * - La proyección del mes solo vale después de la primera semana: una compra
 *   grande el día 2 proyectaría un mes carísimo. Antes de eso, lo único cierto
 *   es lo que ya se gastó.
 * - El promedio solo vale con dos meses cerrados: con uno, un mes atípico
 *   arrastra la estimación y el plan se cree con más dinero del que hay.
 *
 * Con ambas señales fiables se ponderan según los días transcurridos (al
 * principio manda el historial, al final lo real). Si el historial es débil se
 * toma la más alta de las dos: el plan prefiere sobrestimar el gasto antes que
 * prometer metas que no se van a cumplir.
 */
export function chooseBaseline(params: {
  spentThisMonth: number;
  projectedMonthEnd: number;
  avgMonthly: number;
  limit: number;
  daysElapsed: number;
  daysInMonth: number;
  monthsWithData: number;
}): { baseline: number; source: BaselineSource } {
  const { spentThisMonth, projectedMonthEnd, avgMonthly, limit, daysElapsed, daysInMonth, monthsWithData } = params;

  const hasHistory = avgMonthly > 0 && monthsWithData > 0;
  const hasCurrent = spentThisMonth > 0;

  if (!hasHistory && !hasCurrent) {
    return limit > 0 ? { baseline: round2(limit), source: 'limit' } : { baseline: 0, source: 'none' };
  }
  if (!hasCurrent) return { baseline: round2(avgMonthly), source: 'average' };

  // Antes de la primera semana la proyección no es información, es ruido.
  const pace = daysElapsed >= MIN_DAYS_FOR_PACE ? projectedMonthEnd : spentThisMonth;

  if (!hasHistory) return { baseline: round2(pace), source: 'pace' };

  const estimate = monthsWithData >= MIN_MONTHS_FOR_HISTORY
    ? pace * (daysElapsed / daysInMonth) + avgMonthly * (1 - daysElapsed / daysInMonth)
    : Math.max(pace, avgMonthly);

  // Nunca por debajo de lo ya gastado: ese dinero ya salió de la cuenta.
  return { baseline: round2(Math.max(estimate, spentThisMonth)), source: 'pace' };
}

export function computeGroceryInsight(input: GroceryInsightInput): GroceryInsight {
  const now = input.now ?? new Date();
  const currentKey = monthKeyOf(now);

  const current = input.monthlyTotals.find((m) => m.month === currentKey);
  const spentThisMonth = current?.total ?? 0;
  const tripsThisMonth = current?.trips ?? 0;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.min(daysInMonth, Math.max(1, now.getDate()));
  const dailyPace = spentThisMonth / daysElapsed;
  const projectedMonthEnd = dailyPace * daysInMonth;

  const past = input.monthlyTotals.filter((m) => m.month !== currentKey && m.total > 0);
  const avgMonthly = past.length > 0 ? past.reduce((s, m) => s + m.total, 0) / past.length : 0;
  const lastMonth = past.length > 0 ? past[past.length - 1].total : 0;

  const { baseline, source } = chooseBaseline({
    spentThisMonth,
    projectedMonthEnd,
    avgMonthly,
    limit: input.limit,
    daysElapsed,
    daysInMonth,
    monthsWithData: past.length,
  });

  const categories: CategorySpend[] = input.categories
    .filter((c) => c.currentMonth > 0 || c.prevMonth > 0)
    .map((c) => ({
      category: c.category,
      currentMonth: round2(c.currentMonth),
      prevMonth: round2(c.prevMonth),
      deltaPct: c.prevMonth > 0 ? round2(((c.currentMonth - c.prevMonth) / c.prevMonth) * 100) : null,
      share: spentThisMonth > 0 ? round2((c.currentMonth / spentThisMonth) * 100) : 0,
    }))
    .sort((a, b) => b.currentMonth - a.currentMonth);

  // El que más subió en dinero (no en %): un +200% sobre $3 no mueve el plan.
  const risers = categories.filter((c) => c.currentMonth > c.prevMonth && c.prevMonth > 0);
  const biggestMover = risers.length > 0
    ? risers.reduce((best, c) => (c.currentMonth - c.prevMonth > best.currentMonth - best.prevMonth ? c : best))
    : null;

  return {
    spentThisMonth: round2(spentThisMonth),
    tripsThisMonth,
    daysElapsed,
    daysInMonth,
    dailyPace: round2(dailyPace),
    projectedMonthEnd: round2(projectedMonthEnd),
    avgMonthly: round2(avgMonthly),
    lastMonth: round2(lastMonth),
    monthsWithData: past.length,
    limit: round2(input.limit),
    baseline,
    baselineSource: source,
    overLimit: input.limit > 0 ? round2(projectedMonthEnd - input.limit) : 0,
    trendPct: avgMonthly > 0 ? round2(((projectedMonthEnd - avgMonthly) / avgMonthly) * 100) : null,
    categories: categories.slice(0, 6),
    biggestMover,
    topStores: input.stores.slice(0, 3),
  };
}
