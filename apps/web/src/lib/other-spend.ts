/**
 * other-spend.ts — el gasto que NO es super, convertido en cifra del plan.
 *
 * Comer fuera, la farmacia, la gasolina: dinero que sale del mes igual que el
 * super, pero que no tiene productos, ni precios que comparar, ni despensa que
 * llenar. Antes no se restaba en ninguna parte, así que el plan repartía entre
 * metas un dinero que ya se había ido — y las metas fallaban sin explicación.
 *
 * Se apoya deliberadamente en `chooseBaseline` de grocery-insights: la pregunta
 * «¿cuánto voy a gastar este mes?» es la misma, y su respuesta ya está pensada y
 * probada (la proyección no vale antes del día 7; el promedio no vale con un
 * solo mes cerrado; nunca por debajo de lo ya gastado).
 *
 * Módulo PURO (sin SQL) para poder probarlo; las consultas viven en
 * finance-data.ts. Se prueba en other-spend.test.ts.
 */
import type { ExpenseKind } from './expense-kind';
import { chooseBaseline, monthKeyOf, type BaselineSource, type MonthTotal } from './grocery-insights';

export interface KindSpendInput {
  kind: ExpenseKind;
  currentMonth: number;
  prevMonth: number;
  /** Tickets de este tipo en el mes en curso. */
  count: number;
}

export interface KindSpend extends KindSpendInput {
  /** Cambio vs el mes pasado, null si el mes pasado no hubo gasto. */
  deltaPct: number | null;
  /** Parte del gasto "otros" del mes que se lleva este tipo (0–100). */
  share: number;
}

export interface PlaceSpend {
  name: string;
  total: number;
  count: number;
}

export interface OtherSpendInput {
  /** Totales por mes de lo NO-super, incluyendo el actual. */
  monthlyTotals: readonly MonthTotal[];
  byKind: readonly KindSpendInput[];
  places: readonly PlaceSpend[];
  now?: Date;
}

export interface OtherSpendInsight {
  spentThisMonth: number;
  /** Tickets no-super registrados este mes. */
  countThisMonth: number;
  avgMonthly: number;
  lastMonth: number;
  monthsWithData: number;
  projectedMonthEnd: number;
  /** La cifra que el plan resta cada mes por este concepto. */
  baseline: number;
  baselineSource: BaselineSource;
  byKind: KindSpend[];
  /** El tipo que más subió vs el mes pasado, si subió. */
  biggestMover: KindSpend | null;
  topPlaces: PlaceSpend[];
  /** Proyección vs promedio histórico, en %. null si no hay historial. */
  trendPct: number | null;
  /** Hay algo que enseñar: sin esto la sección ni se monta. */
  hasData: boolean;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const EMPTY_OTHER_SPEND: OtherSpendInsight = {
  spentThisMonth: 0,
  countThisMonth: 0,
  avgMonthly: 0,
  lastMonth: 0,
  monthsWithData: 0,
  projectedMonthEnd: 0,
  baseline: 0,
  baselineSource: 'none',
  byKind: [],
  biggestMover: null,
  topPlaces: [],
  trendPct: null,
  hasData: false,
};

export function computeOtherSpend(input: OtherSpendInput): OtherSpendInsight {
  const now = input.now ?? new Date();
  const currentKey = monthKeyOf(now);

  const current = input.monthlyTotals.find((m) => m.month === currentKey);
  const spentThisMonth = current?.total ?? 0;
  const countThisMonth = current?.trips ?? 0;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.min(daysInMonth, Math.max(1, now.getDate()));
  const projectedMonthEnd = (spentThisMonth / daysElapsed) * daysInMonth;

  const past = input.monthlyTotals.filter((m) => m.month !== currentKey && m.total > 0);
  const avgMonthly = past.length > 0 ? past.reduce((s, m) => s + m.total, 0) / past.length : 0;
  const lastMonth = past.length > 0 ? past[past.length - 1].total : 0;

  // Sin límite que declarar —nadie se pone un tope de farmacia— así que el
  // baseline sale solo del historial y del ritmo.
  const { baseline, source } = chooseBaseline({
    spentThisMonth,
    projectedMonthEnd,
    avgMonthly,
    limit: 0,
    daysElapsed,
    daysInMonth,
    monthsWithData: past.length,
  });

  const byKind: KindSpend[] = input.byKind
    .filter((k) => k.currentMonth > 0)
    .map((k) => ({
      kind: k.kind,
      currentMonth: round2(k.currentMonth),
      prevMonth: round2(k.prevMonth),
      count: k.count,
      deltaPct: k.prevMonth > 0 ? round2(((k.currentMonth - k.prevMonth) / k.prevMonth) * 100) : null,
      share: spentThisMonth > 0 ? round2((k.currentMonth / spentThisMonth) * 100) : 0,
    }))
    .sort((a, b) => b.currentMonth - a.currentMonth);

  // El que más subió en DINERO, no en porcentaje: un +300 % sobre $2 no mueve
  // ninguna meta y ocuparía el consejo que merece otro.
  const risers = byKind.filter((k) => k.currentMonth > k.prevMonth && k.prevMonth > 0);
  const biggestMover = risers.length > 0
    ? risers.reduce((best, k) => (k.currentMonth - k.prevMonth > best.currentMonth - best.prevMonth ? k : best))
    : null;

  return {
    spentThisMonth: round2(spentThisMonth),
    countThisMonth,
    avgMonthly: round2(avgMonthly),
    lastMonth: round2(lastMonth),
    monthsWithData: past.length,
    projectedMonthEnd: round2(projectedMonthEnd),
    baseline,
    baselineSource: source,
    byKind,
    biggestMover,
    topPlaces: input.places.slice(0, 3),
    trendPct: avgMonthly > 0 ? round2(((projectedMonthEnd - avgMonthly) / avgMonthly) * 100) : null,
    hasData: spentThisMonth > 0 || past.length > 0,
  };
}
