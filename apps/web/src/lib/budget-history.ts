/**
 * budget-history.ts — construye la ventana de meses para la gráfica de
 * Presupuesto. Puro (sin DB) para poder testearlo; lo usa BudgetView.
 */

export interface BudgetMonthEntry {
  month: string; // YYYY-MM
  total: number;
  trips: number;
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
    months.push(history.find((h) => h.month === key) ?? { month: key, total: 0, trips: 0 });
  }
  while (months.length > 1 && months[0].total === 0) {
    months.shift();
  }
  return months;
}
