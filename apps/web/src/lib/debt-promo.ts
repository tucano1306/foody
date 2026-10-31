/**
 * debt-promo.ts — las promociones al 0 % que CADUCAN.
 *
 * Un saldo «al 0 % hasta el 25/01/2027» no es una deuda al 0 %: es una al 0 %
 * durante N meses y a la tasa normal a partir de ahí. La app lo trataba como
 * gratis para siempre, así que anunciaba «pagarás $0.00 de intereses» y callaba
 * la única fecha que de verdad importa de esa tarjeta.
 *
 * Aquí vive la aritmética de esa fecha: cuántos ciclos quedan, cuánto seguirá
 * debiéndose ese día, qué empezará a costar y qué cuota hace falta para llegar
 * a cero antes. Puro, sin SQL ni React.
 */

import {
  monthlyInterestOf,
  monthlyRateAfterPromo,
  promoLastDueDate,
  promoMonthsLeft,
} from './debt-engine';

// Se reexporta: vive en el motor para que este modulo no cree un ciclo de
// importaciones, pero conceptualmente es de aqui.
export { promoMonthsLeft };

export interface PromoInput {
  balance: number;
  /** Cuota mensual que se está pagando hoy. */
  installment: number;
  /** Fin de la promoción, YYYY-MM-DD. */
  promoEndsOn: string;
  /** APR que empieza a correr el día siguiente, tal como lo imprime el banco. */
  rateAfterPromo: number;
  /** Día del mes en que vence la cuota: decide cuántas caben antes de la fecha. */
  dueDay?: number | null;
  now?: Date;
}

export interface PromoRisk {
  /** Ciclos completos que quedan de promoción. 0 = ya caducó. */
  monthsLeft: number;
  /** Lo que seguirá debiéndose el día que caduque, a la cuota de hoy. */
  balanceAtEnd: number;
  /** Lo que ese resto empezará a costar cada mes. */
  monthlyCostAfter: number;
  /** Cuota necesaria para llegar a cero justo a tiempo. */
  installmentToClear: number;
  /** Cuánto más al mes que ahora hace falta. 0 si la cuota actual ya llega. */
  extraNeeded: number;
  /** La cuota de hoy no basta: el 0 % se acaba con saldo encima. */
  willMissDeadline: boolean;
  /**
   * Día en que cae la última cuota que entra en la promoción, YYYY-MM-DD.
   *
   * Entre esa fecha y `promoEndsOn` está todo el margen que hay. `null` cuando
   * no se sabe el día de vencimiento.
   */
  lastPaymentOn: string | null;
}

/**
 * Qué pasa cuando se acabe la promoción.
 *
 * `installmentToClear` es el número accionable de todo esto: la cuota con la
 * que se llega a cero justo a tiempo. Sin él, avisar de la fecha solo sirve
 * para preocupar.
 */
export function promoRisk(input: PromoInput): PromoRisk {
  const balance = Math.max(0, input.balance);
  const installment = Math.max(0, input.installment);
  const monthsLeft = promoMonthsLeft(input.promoEndsOn, input.now ?? new Date(), input.dueDay);
  const afterMonthly = monthlyRateAfterPromo(input.rateAfterPromo);

  // Durante la promoción la tasa es 0, así que cada cuota baja el saldo entera.
  const balanceAtEnd = Math.max(0, round2(balance - installment * monthsLeft));
  const installmentToClear = monthsLeft > 0 ? round2(balance / monthsLeft) : round2(balance);

  return {
    monthsLeft,
    balanceAtEnd,
    monthlyCostAfter: round2(monthlyInterestOf(balanceAtEnd, afterMonthly)),
    installmentToClear,
    extraNeeded: round2(Math.max(0, installmentToClear - installment)),
    willMissDeadline: balanceAtEnd > 0,
    lastPaymentOn: promoLastDueDate(input.promoEndsOn, input.now ?? new Date(), input.dueDay),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── El aviso: antes y después de que se acabe el 0 % ─────────────────────────

/**
 * Cuántos días antes del fin se avisa en pantalla: unos tres estados de
 * cuenta, tiempo de sobra para reaccionar. Antes de eso el aviso estaría
 * siempre puesto, y un aviso que está siempre deja de leerse.
 */
export const DIAS_DE_AVISO_PROMO = 90;

/** Cuánto tiempo se sigue diciendo «ya cobra interés» después del fin. */
const DIAS_TRAS_EL_FIN = 60;

export interface AvisoPromo {
  /** `antes`: sigue al 0 %. `despues`: el 0 % ya terminó y queda saldo. */
  fase: 'antes' | 'despues';
  /**
   * Antes: días hasta el último día al 0 % (0 = hoy es el último).
   * Después: días desde ese último día.
   */
  dias: number;
  /** Último día al 0 %, YYYY-MM-DD. */
  fin: string;
  /** El día siguiente: desde ahí corre la tasa de después. */
  cobraDesde: string;
  saldo: number;
  /** La tasa de después, en APR como la imprime el banco. */
  apr: number;
  /**
   * El interés de UN mes sobre el saldo de hoy a la tasa de después.
   *
   * Sobre el saldo de hoy y no sobre una proyección: es lo que el usuario pidió
   * ver —«qué me cobrarán si queda esto»— y es una cifra que puede comprobar.
   */
  interesMes: number;
}

/**
 * Si hay que avisar del 0 % de esta deuda hoy (YYYY-MM-DD), y con qué cifras.
 * null si no tiene promoción, ya no debe nada, la tasa de después es 0 o
 * todavía falta mucho (o pasó hace mucho).
 */
export function avisoDePromo(
  deuda: { currentBalance: number; promoEndsOn: string | null; rateAfterPromo: number | null },
  hoy: string,
): AvisoPromo | null {
  if (!deuda.promoEndsOn || deuda.rateAfterPromo == null || deuda.rateAfterPromo <= 0) return null;
  if (deuda.currentBalance <= 0) return null;

  const fin = deuda.promoEndsOn.slice(0, 10);
  const dias = diasEntre(hoy, fin);
  const cifras = {
    fin,
    cobraDesde: diaSiguiente(fin),
    saldo: round2(deuda.currentBalance),
    apr: deuda.rateAfterPromo,
    interesMes: round2(monthlyInterestOf(deuda.currentBalance, monthlyRateAfterPromo(deuda.rateAfterPromo))),
  };
  // `fin` todavía es día al 0 % (promoVigente): dias = 0 sigue siendo «antes».
  if (dias >= 0) return dias <= DIAS_DE_AVISO_PROMO ? { fase: 'antes', dias, ...cifras } : null;
  return -dias <= DIAS_TRAS_EL_FIN ? { fase: 'despues', dias: -dias, ...cifras } : null;
}

/**
 * Los momentos en que se manda una notificación. Cada uno UNA vez por deuda
 * (lo garantiza `debt_promo_alerts`), así que el cron puede correr a diario.
 *
 * Por umbral y no por día exacto: si el cron no corre el día 30, el aviso de
 * los 30 días sale el 29. Y si se da de alta una promo a 20 días del fin, sale
 * el de 30 directamente, no los de 60 y 30 juntos.
 */
export type HitoPromo = '60' | '30' | '7' | '1' | 'fin';

export function hitoDeAvisoPromo(aviso: AvisoPromo | null): HitoPromo | null {
  if (!aviso) return null;
  // Tras el fin, solo el primer mes: una promo que caducó hace tiempo no es
  // noticia, y al desplegar esto no debe llover un aviso por cada deuda vieja.
  if (aviso.fase === 'despues') return aviso.dias <= 30 ? 'fin' : null;
  if (aviso.dias <= 1) return '1';
  if (aviso.dias <= 7) return '7';
  if (aviso.dias <= 30) return '30';
  if (aviso.dias <= 60) return '60';
  return null;
}

/** El texto de la notificación. */
export function mensajeAvisoPromo(
  nombre: string,
  aviso: AvisoPromo,
  currency = 'USD',
): { title: string; body: string } {
  const quien = nombre.replace(/\s+/g, ' ').trim();
  const dinero = (n: number) => dineroDe(n, currency);
  const tasa = `${aviso.apr} %`;
  if (aviso.fase === 'despues') {
    return {
      title: `💸 ${quien} ya cobra interés`,
      body: `El 0 % terminó el ${fechaCorta(aviso.fin)}. Con ${dinero(aviso.saldo)} pendientes son ~${dinero(aviso.interesMes)} al mes (${tasa}).`,
    };
  }
  const cuando = aviso.dias === 0 ? 'hoy' : aviso.dias === 1 ? 'mañana' : `en ${aviso.dias} días`;
  return {
    title: aviso.dias <= 1 ? `⏳ ${quien}: el 0 % se acaba ${cuando}` : `⏳ El 0 % de ${quien} se acaba ${cuando}`,
    body: `Quedan ${dinero(aviso.saldo)}. Si siguen ahí el ${fechaCorta(aviso.fin)}, desde el día siguiente cobrará ~${dinero(aviso.interesMes)} al mes (${tasa}).`,
  };
}

function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function diaSiguiente(clave: string): string {
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «25 ene 2027». A mano y no con Intl: el texto sale igual en el servidor y en los tests. */
function fechaCorta(clave: string): string {
  const [y, m, d] = clave.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

function dineroDe(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
