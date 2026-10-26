/**
 * agenda-pagos.ts — lo que sale de la cuenta en los próximos días.
 *
 * Pagos abría con tres tarjetas (total mensual, pagado, pendiente) que decían
 * CUÁNTO pero no CUÁNDO, y el cuándo es lo que decide si este viernes hay que
 * tener dinero en la cuenta. Las tarjetas de abajo sí traen «en 3 días», pero
 * repartidas por la lista y en el orden de la lista: para saber qué sale esta
 * semana había que leerlas todas.
 *
 * La agenda junta lo vencido y lo que vence en los próximos días, en orden de
 * fecha, con el total de cada grupo.
 *
 * Módulo PURO: sin React y sin SQL. Se prueba en agenda-pagos.test.ts.
 */

export interface PagoParaAgenda {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly isPaidThisMonth: boolean;
  readonly daysUntilDue: number;
  readonly snoozedUntil: string | null;
}

export interface EntradaAgenda {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly dias: number;
  readonly importe: number;
}

export interface AgendaPagos {
  /** Del más atrasado al menos. */
  readonly vencidos: readonly EntradaAgenda[];
  /** De hoy en adelante, el más cercano primero. */
  readonly proximos: readonly EntradaAgenda[];
  readonly totalVencidos: number;
  readonly totalProximos: number;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * @param importeDe la parte del pago que toca en el ámbito que se está
 *   mirando (Personal / Negocio / Todo): la agenda no puede sumar distinto
 *   que el resto de la pantalla.
 */
export function agendaDePagos<P extends PagoParaAgenda>(
  pagos: readonly P[],
  importeDe: (p: P) => number,
  ahora: Date,
  dias = 7,
): AgendaPagos {
  const vivos = pagos.filter(
    (p) => !p.isPaidThisMonth && !(p.snoozedUntil != null && new Date(p.snoozedUntil) > ahora),
  );
  const entrada = (p: P): EntradaAgenda => ({
    id: p.id,
    name: p.name,
    category: p.category,
    dias: p.daysUntilDue,
    importe: centavos(importeDe(p)),
  });

  const vencidos = vivos
    .filter((p) => p.daysUntilDue < 0)
    .map(entrada)
    .sort((a, b) => a.dias - b.dias);
  const proximos = vivos
    .filter((p) => p.daysUntilDue >= 0 && p.daysUntilDue <= dias)
    .map(entrada)
    .sort((a, b) => a.dias - b.dias || a.name.localeCompare(b.name, 'es'));

  const suma = (l: readonly EntradaAgenda[]) => centavos(l.reduce((s, e) => s + e.importe, 0));
  return { vencidos, proximos, totalVencidos: suma(vencidos), totalProximos: suma(proximos) };
}

/** «hoy», «mañana», «en 3 días», «hace 2 días». */
export function cuandoVence(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}
