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
  /**
   * La parte del mes que NO está desglosada por categoría: tickets guardados
   * solo con su total, sin productos vinculados.
   *
   * Existe porque el desglose salía de los ítems y el total de los tickets, y
   * nadie cuadraba los dos: el mes decía «llevas $104» y las categorías sumaban
   * $23. Los $81 que faltaban eran precisamente las compras recién escaneadas —
   * el usuario las registraba y no las veía en ningún sitio.
   *
   * Va aparte de `categories` a propósito: es un hueco de información, no una
   * categoría de gasto, y meterlo en la lista haría que el consejero sugiriese
   * «recorta un 15 % en Sin detallar», que no significa nada.
   *
   * null cuando no hay hueco que declarar.
   */
  unitemized: CategorySpend | null;
  /** Categoría que más subió vs el mes pasado, si subió. */
  biggestMover: CategorySpend | null;
  topStores: StoreSpend[];
  /**
   * true cuando ya hay días y compras suficientes para que el ritmo y la
   * proyección signifiquen algo. Antes de eso la UI debe callar en vez de
   * anunciar "cerrarás en $0" o "vas $500 por debajo del límite".
   */
  paceIsMeaningful: boolean;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** El mes de CALENDARIO anterior — no "el último con datos", que puede ser otro. */
export function prevMonthKeyOf(date: Date): string {
  return monthKeyOf(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

/**
 * Nombre del bloque que recoge lo que un ticket no desglosa.
 *
 * Se dice en el idioma del usuario, no en el del modelo de datos: "Sin
 * detallar" describe lo que pasó (no vinculaste los productos), mientras que
 * "unitemized" o "Sin categoría" —que ya existe y significa otra cosa— no.
 */
export const UNITEMIZED_LABEL = 'Sin detallar';

/**
 * Por debajo de esto el hueco es ruido de redondeo (centavos del reparto) y
 * mostrarlo sería peor que callarlo.
 */
const UNITEMIZED_MIN = 0.5;

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
  unitemized: null,
  biggestMover: null,
  topStores: [],
  paceIsMeaningful: false,
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

  // Solo lo que se gastó ESTE mes. Incluir las de gasto cero producía filas
  // fantasma —"Café $0 −100%"— los primeros días, cuando aún no hay compras.
  const categories: CategorySpend[] = input.categories
    .filter((c) => c.currentMonth > 0)
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

  // ── Lo que el desglose no explica ──────────────────────────────────────────
  // Las categorías salen de los PRODUCTOS del ticket; el total del mes sale de
  // los TICKETS. Un recibo guardado solo con su total —lo normal al escanear—
  // aporta al total y no aporta a ninguna categoría, y esa diferencia se perdía
  // en silencio. Se declara aquí para que las dos cifras cuadren siempre.
  //
  // El mes anterior se busca por CALENDARIO y no como "el último con datos":
  // comparar agosto contra junio porque julio salió vacío sería mentir.
  const prevKey = prevMonthKeyOf(now);
  const prevTotal = input.monthlyTotals.find((m) => m.month === prevKey)?.total ?? 0;
  const itemizedNow = input.categories.reduce((s, c) => s + Math.max(0, c.currentMonth), 0);
  const itemizedPrev = input.categories.reduce((s, c) => s + Math.max(0, c.prevMonth), 0);
  // El máximo con 0 no es defensivo por gusto: los tickets sueltos sin ticket
  // formal pueden sumar más que su visita, y un hueco negativo no existe.
  const gapNow = Math.max(0, spentThisMonth - itemizedNow);
  const gapPrev = Math.max(0, prevTotal - itemizedPrev);

  const unitemized: CategorySpend | null = gapNow >= UNITEMIZED_MIN
    ? {
        category: UNITEMIZED_LABEL,
        currentMonth: round2(gapNow),
        prevMonth: round2(gapPrev),
        deltaPct: gapPrev > 0 ? round2(((gapNow - gapPrev) / gapPrev) * 100) : null,
        share: spentThisMonth > 0 ? round2((gapNow / spentThisMonth) * 100) : 0,
      }
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
    unitemized,
    biggestMover,
    topStores: input.stores.slice(0, 3),
    paceIsMeaningful: daysElapsed >= MIN_DAYS_FOR_PACE && spentThisMonth > 0,
  };
}

/**
 * El mismo panorama de super, con SOLO la parte personal.
 *
 * Hace falta porque el Plan financiero tiene dos caminos que hablaban idiomas
 * distintos: la cascada del mes restaba el super ya repartido por su porcentaje
 * de negocio, mientras el consejero leía este objeto TAL CUAL y citaba cifras
 * que incluían el negocio. Con el interruptor «contar el negocio» apagado, la
 * misma pantalla daba dos versiones del mismo gasto.
 *
 * Se multiplica todo el dinero por la fracción personal y NO se tocan los
 * conteos ni los porcentajes: los tickets siguen siendo los mismos tickets, y
 * como el reparto es uniforme, las proporciones entre categorías y la tendencia
 * no cambian.
 *
 * El límite es la excepción: es una cifra que el usuario escribió para su
 * presupuesto, no un importe repartible, así que se respeta tal cual y lo que
 * se recalcula es cuánto se pasa de él.
 */
export function personalGroceryInsight(insight: GroceryInsight, businessShare: number): GroceryInsight {
  const personal = 1 - Math.min(100, Math.max(0, businessShare)) / 100;
  if (personal >= 1) return insight;

  const cut = (n: number) => round2(n * personal);
  const cutCategory = (c: CategorySpend): CategorySpend => ({
    ...c,
    currentMonth: cut(c.currentMonth),
    prevMonth: cut(c.prevMonth),
  });

  const projectedMonthEnd = cut(insight.projectedMonthEnd);

  return {
    ...insight,
    spentThisMonth: cut(insight.spentThisMonth),
    dailyPace: cut(insight.dailyPace),
    projectedMonthEnd,
    avgMonthly: cut(insight.avgMonthly),
    lastMonth: cut(insight.lastMonth),
    baseline: cut(insight.baseline),
    overLimit: insight.limit > 0 ? round2(projectedMonthEnd - insight.limit) : 0,
    categories: insight.categories.map(cutCategory),
    unitemized: insight.unitemized ? cutCategory(insight.unitemized) : null,
    biggestMover: insight.biggestMover ? cutCategory(insight.biggestMover) : null,
    topStores: insight.topStores.map((s) => ({ ...s, total: cut(s.total) })),
  };
}
