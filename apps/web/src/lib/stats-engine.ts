/**
 * stats-engine.ts — cálculos de la sección Estadísticas.
 *
 * Antes vivían dentro de la página: porcentajes de despensa, máximos para las
 * barras y la generación de conclusiones. Eso los dejaba sin poder probarse,
 * y son justo el tipo de código donde los bordes muerden — divisiones por
 * cero, meses sin datos, un mes que arranca desde cero.
 *
 * Módulo PURO: sin SQL, sin React, con el `now` inyectable.
 * Se prueba en stats-engine.test.ts; las consultas siguen en la página.
 */

export interface StockCount {
  full: number;
  half: number;
  empty: number;
}

export interface MonthSpend {
  month: string; // YYYY-MM
  total: number;
  trips: number;
}

export interface CategorySpend {
  category: string;
  currentMonth: number;
  prevMonth: number;
}

export interface StoreSpend {
  name: string;
  trips: number;
  totalSpent: number;
}

export type InsightTone = 'up' | 'down';

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: string;
  text: string;
  /** Variación en %, ya redondeada y en valor absoluto. */
  percent: number;
}

export interface StockBreakdown extends StockCount {
  total: number;
  fullPct: number;
  halfPct: number;
  emptyPct: number;
}

/** Redondea repartiendo el resto para que los porcentajes sumen 100. */
function percentagesThatSumTo100(parts: readonly number[], total: number): number[] {
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((p) => (p / total) * 100);
  const floored = exact.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  // El resto va a las partes con mayor fracción perdida, de mayor a menor.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

/**
 * Reparto de la despensa en porcentajes.
 *
 * Los porcentajes suman exactamente 100: redondear cada uno por su cuenta
 * producía "34% + 33% + 34% = 101%" a la vista del usuario.
 */
export function computeStockBreakdown(stock: StockCount): StockBreakdown {
  const full = Math.max(0, stock.full);
  const half = Math.max(0, stock.half);
  const empty = Math.max(0, stock.empty);
  const total = full + half + empty;
  const [fullPct, halfPct, emptyPct] = percentagesThatSumTo100([full, half, empty], total);
  return { full, half, empty, total, fullPct, halfPct, emptyPct };
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Clave del mes anterior, cruzando bien el cambio de año. */
export function previousMonthKey(now: Date): string {
  return monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export interface MonthComparison {
  thisMonth: number;
  lastMonth: number;
  /** Variación en %, o null si el mes pasado fue 0 (no se puede comparar). */
  changePct: number | null;
}

export function compareMonths(months: readonly MonthSpend[], now: Date = new Date()): MonthComparison {
  const thisKey = monthKeyOf(now);
  const prevKey = previousMonthKey(now);
  const thisMonth = months.find((m) => m.month === thisKey)?.total ?? 0;
  const lastMonth = months.find((m) => m.month === prevKey)?.total ?? 0;
  const changePct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  return { thisMonth, lastMonth, changePct };
}

/** Máximo para escalar barras; nunca 0, para no dividir por cero al pintar. */
export function maxOf(values: readonly number[]): number {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  return max > 0 ? max : 1;
}

/** Umbrales a partir de los cuales una variación merece contarse. */
const TOTAL_THRESHOLD = 5;
const CATEGORY_DOWN = 15;
const CATEGORY_UP = 20;
const MAX_INSIGHTS = 4;

/**
 * Conclusiones en lenguaje llano sobre el mes.
 *
 * Se ordenan por magnitud, no por el orden en que llegan las categorías: si
 * solo caben cuatro, que sean las cuatro que más se movieron.
 */
export function buildInsights(
  categories: readonly CategorySpend[],
  comparison: MonthComparison,
): Insight[] {
  const out: Insight[] = [];

  const { changePct, thisMonth } = comparison;
  if (changePct !== null && thisMonth > 0 && Math.abs(changePct) > TOTAL_THRESHOLD) {
    const down = changePct < 0;
    out.push({
      id: 'total',
      tone: down ? 'down' : 'up',
      icon: down ? '📉' : '📈',
      percent: Math.abs(changePct),
      text: `Gastaste ${Math.abs(changePct)}% ${down ? 'menos' : 'más'} en total este mes`,
    });
  }

  const moves: Insight[] = [];
  for (const cat of categories) {
    // Sin gasto el mes pasado no hay porcentaje que calcular (división por 0);
    // sin gasto este mes, "−100%" es ruido de una categoría que dejó de usarse.
    if (cat.prevMonth <= 0 || cat.currentMonth <= 0) continue;
    const pct = Math.round(((cat.currentMonth - cat.prevMonth) / cat.prevMonth) * 100);
    const down = pct <= -CATEGORY_DOWN;
    const up = pct >= CATEGORY_UP;
    if (!down && !up) continue;
    moves.push({
      id: `cat-${cat.category}`,
      tone: down ? 'down' : 'up',
      icon: down ? '📉' : '📈',
      percent: Math.abs(pct),
      text: `Gastaste ${Math.abs(pct)}% ${down ? 'menos' : 'más'} en ${cat.category} este mes`,
    });
  }

  // Lo que más se movió primero: con un tope de 4, el orden importa.
  moves.sort((a, b) => b.percent - a.percent);

  return [...out, ...moves].slice(0, MAX_INSIGHTS);
}

export interface StatsSummary {
  stock: StockBreakdown;
  comparison: MonthComparison;
  insights: Insight[];
  maxTrips: number;
  maxSpend: number;
}

/** Todo lo que la página necesita calcular, en una sola llamada. */
export function buildStatsSummary(input: {
  stock: StockCount;
  months: readonly MonthSpend[];
  categories: readonly CategorySpend[];
  stores: readonly StoreSpend[];
  now?: Date;
}): StatsSummary {
  const comparison = compareMonths(input.months, input.now ?? new Date());
  return {
    stock: computeStockBreakdown(input.stock),
    comparison,
    insights: buildInsights(input.categories, comparison),
    maxTrips: maxOf(input.stores.map((s) => s.trips)),
    maxSpend: maxOf(input.months.map((m) => m.total)),
  };
}
