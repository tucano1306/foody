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
 * Los recibos que no son mensuales (un seguro de $515 cada seis meses) van en
 * su propio grupo, «Se acercan», y con más antelación: entran UN MES antes de
 * vencer. No son un gasto del mes —no suman en los pagos mensuales— pero tener
 * $515 listos para el 19 de abril se prepara desde marzo, no la semana antes.
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
  /** Sin frecuencia (filas viejas) es mensual. */
  readonly frequency?: unknown;
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
  /** Recibos de cada varios meses que vencen en el próximo mes. */
  readonly seAcercan: readonly EntradaAgenda[];
  readonly totalVencidos: number;
  readonly totalProximos: number;
  readonly totalSeAcercan: number;
}

/** Con cuánta antelación entra en la agenda un recibo que no es mensual. */
export const DIAS_AVISO_PERIODICO = 31;

function esMensual(p: { readonly frequency?: unknown }): boolean {
  return p.frequency == null || p.frequency === 'monthly';
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
  const pospuesto = (p: P) => p.snoozedUntil != null && new Date(p.snoozedUntil) > ahora;
  const vivos = pagos.filter((p) => !p.isPaidThisMonth && !pospuesto(p));
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
  const porFecha = (a: EntradaAgenda, b: EntradaAgenda) => a.dias - b.dias || a.name.localeCompare(b.name, 'es');
  const proximos = vivos
    .filter((p) => esMensual(p) && p.daysUntilDue >= 0 && p.daysUntilDue <= dias)
    .map(entrada)
    .sort(porFecha);
  // Un recibo de cada varios meses fuera de su mes se da por «al día»
  // (isPaidThisMonth), así que aquí no se filtra por eso: lo que manda es
  // cuánto falta para su próximo cobro. Uno ya pagado en este ciclo tiene el
  // siguiente a meses y no entra.
  const seAcercan = pagos
    .filter((p) => !esMensual(p) && !pospuesto(p) && p.daysUntilDue >= 0 && p.daysUntilDue <= DIAS_AVISO_PERIODICO)
    .map(entrada)
    .sort(porFecha);

  const suma = (l: readonly EntradaAgenda[]) => centavos(l.reduce((s, e) => s + e.importe, 0));
  return {
    vencidos,
    proximos,
    seAcercan,
    totalVencidos: suma(vencidos),
    totalProximos: suma(proximos),
    totalSeAcercan: suma(seAcercan),
  };
}

/** «hoy», «mañana», «en 3 días», «hace 2 días». */
export function cuandoVence(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}
