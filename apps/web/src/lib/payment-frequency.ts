/**
 * payment-frequency.ts — cada cuánto se paga un recibo.
 *
 * Pagos nacía asumiendo que TODO era mensual: la tabla solo guardaba el día del
 * mes y el plan financiero sumaba el importe como coste mensual. Un seguro de
 * coche que se paga cada 6 meses no tenía sitio: con la prima entera el plan
 * creía que salía ese dinero todos los meses, y con la prima partida entre seis
 * la cuenta cuadraba pero los meses en que no toca pagar se acumulaban como
 * atrasos.
 *
 * Aquí vive lo que hace falta para que un recibo diga cada cuánto vence, sin
 * React ni SQL, para poder probarlo solo.
 */

export const PAYMENT_FREQUENCIES = [
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
] as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

/** Meses que dura un ciclo. Todos dividen a 12, que es lo que hace que el mes
 *  de anclaje baste para saber en qué meses cae sin arrastrar el año. */
const MONTHS_PER_CYCLE: Record<PaymentFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const FREQUENCY_LABEL: Record<PaymentFrequency, string> = {
  monthly: 'Cada mes',
  bimonthly: 'Cada 2 meses',
  quarterly: 'Cada 3 meses',
  semiannual: 'Cada 6 meses',
  annual: 'Una vez al año',
};

/** Lo que dice la tarjeta junto al importe: «$900 cada 6 meses». */
export const FREQUENCY_SUFFIX: Record<PaymentFrequency, string> = {
  monthly: '/mes',
  bimonthly: ' cada 2 meses',
  quarterly: ' cada 3 meses',
  semiannual: ' cada 6 meses',
  annual: ' al año',
};

/** Cualquier cosa que llegue de fuera, convertida en una frecuencia válida. */
export function normalizeFrequency(value: unknown): PaymentFrequency {
  return PAYMENT_FREQUENCIES.includes(value as PaymentFrequency)
    ? (value as PaymentFrequency)
    : 'monthly';
}

export function monthsPerCycle(frequency: PaymentFrequency): number {
  return MONTHS_PER_CYCLE[frequency] ?? 1;
}

/**
 * Lo que ese recibo cuesta AL MES.
 *
 * Es la cifra que resta el plan financiero: un seguro de $900 cada seis meses
 * cuesta $150 al mes, aunque el cargo llegue de golpe dos veces al año. Sin
 * esto, el plan multiplicaba por seis el gasto de cualquier recibo semestral.
 */
export function monthlyCost(amount: number, frequency: PaymentFrequency): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round((amount / monthsPerCycle(frequency)) * 100) / 100;
}

/**
 * Mes de anclaje válido (1-12), o `null` cuando el recibo es mensual y no hace
 * falta ninguno.
 */
export function normalizeAnchorMonth(value: unknown, frequency: PaymentFrequency): number | null {
  if (frequency === 'monthly') return null;
  const n = typeof value === 'number' ? Math.trunc(value) : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 1;
}

/**
 * ¿A este recibo le toca vencer en este mes?
 *
 * El mes de anclaje dice cuándo cae uno de los cobros; el resto se deducen
 * sumando ciclos. Un semestral anclado en marzo vence en marzo y en septiembre.
 *
 * Se calcula sobre el mes DEL AÑO y no sobre una cuenta absoluta de meses a
 * propósito: así el calendario del recibo no se desplaza nunca, ni al cambiar
 * de año ni si se edita el recibo más adelante.
 */
export function isDueInMonth(
  frequency: PaymentFrequency,
  anchorMonth: number | null,
  month: number,
): boolean {
  const every = monthsPerCycle(frequency);
  if (every <= 1) return true;
  const anchor = anchorMonth ?? 1;
  return (((month - anchor) % every) + every) % every === 0;
}

/**
 * El próximo mes (1-12) en que toca pagar, contando desde `fromMonth` incluido.
 *
 * Devuelve también cuántos meses faltan, que es lo que necesita la cuenta atrás
 * para no tener que recorrer el calendario otra vez.
 */
export function nextDueMonth(
  frequency: PaymentFrequency,
  anchorMonth: number | null,
  fromMonth: number,
): { month: number; monthsAhead: number } {
  const every = monthsPerCycle(frequency);
  for (let ahead = 0; ahead < every; ahead += 1) {
    const month = ((fromMonth - 1 + ahead) % 12) + 1;
    if (isDueInMonth(frequency, anchorMonth, month)) return { month, monthsAhead: ahead };
  }
  // Inalcanzable: en `every` meses siempre cae uno. Se devuelve algo coherente
  // en vez de dejar que el llamador reciba `undefined`.
  return { month: fromMonth, monthsAhead: 0 };
}
