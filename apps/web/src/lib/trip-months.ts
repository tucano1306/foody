/**
 * trip-months.ts — los tickets de Compras agrupados por mes, y paginados dentro.
 *
 * Compras era una sola lista de tickets de arriba abajo, y con 22 en cuatro
 * meses ya era larga para recorrerla con el dedo. Ahora cada mes es un bloque
 * que se abre al tocarlo, con sus compras dentro de cinco en cinco.
 *
 * Módulo PURO: sin React y sin SQL. Se prueba en trip-months.test.ts.
 */

import { diaDeLaFecha } from './app-time';

/** Cuántas compras enseña un mes por página. Septiembre, con 11, da 3. */
export const TRIPS_PER_PAGE = 5;

/** Los tickets sin fecha legible van juntos, al final. */
export const SIN_FECHA = 'sin-fecha';

export interface MonthGroup<T> {
  /** «2026-09»: ordena bien como texto y sirve de clave estable. */
  readonly key: string;
  /** «Septiembre de 2026». */
  readonly label: string;
  /** Del más reciente al más antiguo. */
  readonly trips: readonly T[];
  /** La suma de lo que se enseña de cada ticket, redondeada a centavos. */
  readonly total: number;
}

/**
 * El mes de un ticket: el del día que se enseña en la lista.
 *
 * Con la misma regla que la fecha (app-time.ts), o el bloque y la fecha se
 * contradirían: un ticket del calendario del 1 de septiembre es de septiembre
 * aunque en Miami fueran las 8 de la noche del 31 de agosto; y una compra
 * cerrada en Súper a las 22:00 del 30 de septiembre es de septiembre aunque en
 * UTC ya fuera 1 de octubre. `zona` es la del dispositivo del usuario.
 */
export function monthKey(iso: string, zona: string): string {
  const d = diaDeLaFecha(iso, zona);
  if (!d) return SIN_FECHA;
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
}

/** «Septiembre de 2026». */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return 'Sin fecha';
  const texto = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function tiempo(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Los tickets por mes: el mes más reciente primero, y dentro de cada mes el
 * ticket más reciente primero. Los que no tienen fecha, en un grupo al final.
 */
export function groupByMonth<T extends { readonly purchasedAt: string; readonly totalAmount: number }>(
  trips: readonly T[],
  zona: string,
): MonthGroup<T>[] {
  const porMes = new Map<string, T[]>();
  for (const trip of trips) {
    const key = monthKey(trip.purchasedAt, zona);
    const lista = porMes.get(key);
    if (lista) lista.push(trip);
    else porMes.set(key, [trip]);
  }

  return [...porMes.entries()]
    .sort(([a], [b]) => {
      if (a === SIN_FECHA) return 1;
      if (b === SIN_FECHA) return -1;
      return b.localeCompare(a);
    })
    .map(([key, lista]) => ({
      key,
      label: monthLabel(key),
      // `sort` es estable: dos tickets del mismo instante conservan el orden
      // en que llegaron.
      trips: [...lista].sort((a, b) => tiempo(b.purchasedAt) - tiempo(a.purchasedAt)),
      total: Math.round(lista.reduce((suma, t) => suma + t.totalAmount, 0) * 100) / 100,
    }));
}

export interface Page<T> {
  readonly items: readonly T[];
  /** La página que se enseña, desde 0, ya dentro de los límites. */
  readonly page: number;
  /** Cuántas hay. Nunca menos de 1: un mes vacío es una página vacía. */
  readonly pages: number;
}

/**
 * Una página de la lista.
 *
 * Recorta la página pedida a las que existen. Hace falta porque la página se
 * recuerda por mes y el filtro de ámbito puede encoger ese mes: estar en la
 * página 3 de septiembre y pasar a «Negocio», donde septiembre tiene 2
 * tickets, tiene que enseñar esos 2 y no una página vacía.
 */
export function paginate<T>(items: readonly T[], page: number, size = TRIPS_PER_PAGE): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const actual = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1);
  return { items: items.slice(actual * size, actual * size + size), page: actual, pages };
}
