/**
 * budget-history.ts — construye la ventana de meses para la gráfica de
 * Presupuesto. Puro (sin DB) para poder testearlo; lo usa BudgetView.
 */

import type { ScopeFilter } from '@/lib/expense-scope';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface BudgetMonthEntry {
  month: string; // YYYY-MM
  total: number;
  trips: number;
  /**
   * De ese total, cuánto salió del bolsillo del usuario.
   *
   * Los tickets del súper llevan su porcentaje de negocio; las compras sueltas
   * (sin ticket) no tienen ámbito y cuentan enteras como personales, que es lo
   * que son mientras nadie diga lo contrario.
   */
  personal: number;
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ventana de hasta `span` meses terminando en el mes ACTUAL, con los meses
 * sin datos rellenados en $0. Los meses vacíos al inicio se recortan para
 * que la gráfica arranque en el primer mes con datos (la app se empezó a
 * usar en junio 2026 — no tiene sentido mostrar feb–may en $0) y de ahí
 * continúe mes a mes.
 */
export function buildHistoryWindow(
  history: readonly BudgetMonthEntry[],
  now: Date = new Date(),
  span = 6,
): BudgetMonthEntry[] {
  const months: BudgetMonthEntry[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKeyOf(d);
    months.push(history.find((h) => h.month === key) ?? { month: key, total: 0, trips: 0, personal: 0 });
  }
  while (months.length > 1 && months[0].total === 0) {
    months.shift();
  }
  return months;
}

/** Cuánto de un mes corresponde al lado que se está mirando. */
export function monthAmount(entry: BudgetMonthEntry, scope: ScopeFilter): number {
  if (scope === 'personal') return entry.personal;
  if (scope === 'business') return round2(entry.total - entry.personal);
  return entry.total;
}

export interface BudgetFigures {
  spentThisMonth: number;
  avgMonthly: number;
  percentUsed: number | null;
  remaining: number | null;
}

/**
 * Las cuatro cifras de Presupuesto, para el lado que se pida.
 *
 * Vive aquí —pura y compartida— porque las calculan DOS sitios: el servidor
 * para la vista completa y la pantalla al cambiar de pestaña. Con la fórmula
 * duplicada, el día que cambie una de las dos copias, «llevas gastado» y la
 * gráfica de debajo dejarían de cuadrar sin que nadie se entere.
 *
 * El LÍMITE no se reparte: es una cifra que el usuario escribió para su
 * presupuesto, no un importe repartible. Lo que cambia es cuánto se lleva
 * gastado contra él.
 */
export function budgetFigures(
  history: readonly BudgetMonthEntry[],
  monthlyLimit: number,
  scope: ScopeFilter = 'all',
  now: Date = new Date(),
): BudgetFigures {
  const nowKey = monthKeyOf(now);
  const current = history.find((h) => h.month === nowKey);
  const spentThisMonth = current ? monthAmount(current, scope) : 0;

  // Promedio solo sobre meses COMPLETOS con datos: el mes en curso a medias
  // distorsionaría la sugerencia de límite.
  const pastMonths = history.filter((h) => h.month !== nowKey);
  const avgMonthly =
    pastMonths.length > 0
      ? Math.round(pastMonths.reduce((sum, h) => sum + monthAmount(h, scope), 0) / pastMonths.length)
      : 0;

  return {
    spentThisMonth: round2(spentThisMonth),
    avgMonthly,
    percentUsed: monthlyLimit > 0 ? Math.min(200, (spentThisMonth / monthlyLimit) * 100) : null,
    remaining: monthlyLimit > 0 ? round2(monthlyLimit - spentThisMonth) : null,
  };
}
