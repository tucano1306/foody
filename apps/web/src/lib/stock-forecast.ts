/**
 * stock-forecast.ts — cuándo avisar de que un producto se acaba, y cuándo callar.
 *
 * El aviso diario de «Carbone ya se agotó» sobre un producto marcado COMO LLENO
 * salía de aquí, y tenía tres fallos que se sumaban:
 *
 *  1. El reloj arrancaba en la última COMPRA e ignoraba que el usuario había
 *     dicho «lo tengo» después. Comprado hace 26 días, marcado lleno hace 14:
 *     la cuenta seguía usando los 26 y concluía que no quedaba nada.
 *  2. Dos tickets del mismo día contaban como dos compras seguidas, así que el
 *     «ciclo de consumo» de una salsa salía de 0,9 días. Con eso, cualquier
 *     producto está agotado al día siguiente para siempre.
 *  3. El antirrepetición solo actuaba cuando la compra era RECIENTE, que es
 *     justo el caso en que no hace falta. Pasado ese punto, el mismo aviso se
 *     repetía cada mañana sin fin.
 *
 * La regla que ordena todo: **lo que el usuario afirma gana a lo que la app
 * predice**. Una predicción sirve para avisar de lo que aún no se ha mirado,
 * nunca para contradecir a quien acaba de decir que tiene el producto en casa.
 *
 * Módulo PURO: sin SQL, sin fechas implícitas. Se prueba en stock-forecast.test.ts.
 */

export type StockLevel = 'full' | 'half' | 'empty';

export interface StockForecastInput {
  stockLevel: StockLevel;
  /**
   * Días entre compras, promediados sobre DÍAS DISTINTOS de compra. Null
   * cuando no hay historial suficiente.
   */
  avgIntervalDays: number | null;
  /** Cuántos días distintos ha comprado el producto. */
  purchaseDays: number;
  lastPurchasedAt: Date;
  /** Cuándo tocó el usuario el stock por última vez. Null = nunca. */
  stockUpdatedAt: Date | null;
  /** Cuándo se le avisó por última vez de este producto. Null = nunca. */
  lastAlertAt: Date | null;
  now: Date;
}

/** Por qué se avisa o por qué se calla — para poder depurar el cron sin adivinar. */
export type ForecastReason =
  | 'alert'
  | 'no-history'
  | 'cycle-too-short'
  | 'plenty-left'
  | 'already-alerted';

export interface StockForecast {
  shouldAlert: boolean;
  reason: ForecastReason;
  /** Días que quedan según el ciclo, contados desde la última señal. */
  daysRemaining: number;
  /** Qué decir: ya se acabó, o se va a acabar. */
  tone: 'out' | 'soon';
}

const DAY_MS = 86_400_000;

/**
 * Mínimo de días de compra para fiarse del promedio.
 *
 * Con dos compras hay UN intervalo, y si las dos cayeron en la misma semana
 * ese intervalo no describe ningún hábito. Con tres días distintos hay al menos
 * dos intervalos que promediar, que ya es una señal y no una anécdota.
 */
export const MIN_PURCHASE_DAYS = 3;

/**
 * Ciclos por debajo de esto son ruido, no hábitos.
 *
 * Nadie consume y repone un producto de despensa en menos de dos días; cuando
 * el dato lo dice, lo que hay detrás son dos tickets de la misma compra.
 */
export const MIN_CYCLE_DAYS = 2;

/** Cuánto callar tras avisar: medio ciclo, y nunca menos de una semana. */
export function quietPeriodDays(avgIntervalDays: number): number {
  return Math.max(7, Math.round(avgIntervalDays * 0.5));
}

/** Qué parte del ciclo le queda a un producto según cómo lo marcó el usuario. */
export function stockFraction(level: StockLevel): number {
  if (level === 'full') return 1;
  if (level === 'half') return 0.5;
  return 0;
}

/**
 * Desde cuándo contar el consumo.
 *
 * La señal más RECIENTE manda. Marcar «lo tengo lleno» es información más
 * fresca que una compra de hace tres semanas, y es la que el usuario espera que
 * la app use: si acaba de decir que lo tiene, no puede recibir un aviso de que
 * se le acabó.
 */
export function cycleStart(input: Pick<StockForecastInput, 'lastPurchasedAt' | 'stockUpdatedAt'>): Date {
  const purchase = input.lastPurchasedAt.getTime();
  const stock = input.stockUpdatedAt?.getTime() ?? 0;
  return new Date(Math.max(purchase, stock));
}

export function forecastStock(input: StockForecastInput): StockForecast {
  const { avgIntervalDays: avg, stockLevel, now } = input;

  const empty: StockForecast = { shouldAlert: false, reason: 'no-history', daysRemaining: 0, tone: 'soon' };

  // ── Sin historial que sostenga una predicción ──────────────────────────────
  if (avg === null || !Number.isFinite(avg) || input.purchaseDays < MIN_PURCHASE_DAYS) {
    return empty;
  }
  if (avg < MIN_CYCLE_DAYS) {
    return { ...empty, reason: 'cycle-too-short' };
  }

  // ── Cuánto queda, contado desde la última señal ────────────────────────────
  const start = cycleStart(input).getTime();
  const elapsedDays = (now.getTime() - start) / DAY_MS;
  const daysRemaining = Math.round(avg * stockFraction(stockLevel) - elapsedDays);

  // El umbral escala con el ciclo: en algo que se compra cada 30 días avisar
  // con 3 de margen es tarde, y en algo semanal avisar con 8 es absurdo.
  const threshold = Math.max(2, Math.round(avg * 0.25));
  if (daysRemaining > threshold) {
    return { shouldAlert: false, reason: 'plenty-left', daysRemaining, tone: 'soon' };
  }

  // ── Un aviso por ciclo, no uno por mañana ──────────────────────────────────
  if (input.lastAlertAt) {
    const sinceAlert = (now.getTime() - input.lastAlertAt.getTime()) / DAY_MS;
    if (sinceAlert < quietPeriodDays(avg)) {
      return { shouldAlert: false, reason: 'already-alerted', daysRemaining, tone: 'soon' };
    }
  }

  return {
    shouldAlert: true,
    reason: 'alert',
    daysRemaining,
    // Nunca «ya se agotó» sobre algo que el usuario marcó lleno: eso es
    // contradecirle. Como mucho, que se le va a acabar.
    tone: daysRemaining <= 0 && stockLevel !== 'full' ? 'out' : 'soon',
  };
}

/** El texto del aviso, coherente con lo que el usuario dijo del producto. */
export function forecastMessage(
  firstName: string | null,
  productName: string,
  forecast: StockForecast,
  avgIntervalDays: number,
): string {
  const saludo = firstName ? `Hola ${firstName}, ` : '¡Hola! ';
  const cycle = Math.round(avgIntervalDays);

  if (forecast.tone === 'out') {
    return `${saludo}parece que ${productName} ya se agotó. ¡Te lo agregamos a la lista del súper! 🛒`;
  }
  const dias = Math.max(0, forecast.daysRemaining);
  if (dias <= 1) {
    return `${saludo}${productName} está por acabarse: lo compras cada ~${cycle} días y ya toca. ¿Lo agregamos a la lista? 🛒`;
  }
  return `${saludo}según tus compras (cada ~${cycle} días), ${productName} te durará unos ${dias} días más. ¡Buen momento para reponerlo! 🛒`;
}
