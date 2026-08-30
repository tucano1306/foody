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
 * El ciclo, deducido de UNA fecha de cobro.
 *
 * Se pregunta así y no con «día del mes» + «mes de anclaje» por separado porque
 * nadie piensa una póliza en esos términos: se piensa «me cobran el 14 de
 * octubre». Con dos campos sueltos es fácil dejar el día en 1 y el mes en el
 * actual —que es lo que pasó con un seguro de abril anclado sin querer en
 * agosto— y entonces la app reclama el cobro un mes en que no toca.
 */
export function cycleFromDate(value: string | Date | null | undefined): {
  dueDay: number;
  anchorMonth: number;
} | null {
  if (!value) return null;
  // Las fechas «YYYY-MM-DD» se leen en LOCAL, no en UTC: `new Date('2026-10-14')`
  // es medianoche UTC y en América se convierte en el día 13.
  const date =
    typeof value === 'string'
      ? (() => {
          const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
          return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
        })()
      : value;
  if (Number.isNaN(date.getTime())) return null;
  return { dueDay: date.getDate(), anchorMonth: date.getMonth() + 1 };
}

/**
 * La próxima fecha en que toca pagar, a partir de hoy.
 *
 * Sirve para dos cosas: enseñar «te lo cobran el 14 de octubre» y rellenar el
 * campo de fecha al abrir el editor, para que quien edite vea lo que ya hay en
 * vez de un hueco.
 */
export function nextDueOn(
  frequency: PaymentFrequency,
  anchorMonth: number | null,
  dueDay: number,
  now: Date = new Date(),
): Date {
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const every = monthsPerCycle(frequency);

  // Se recorren los ciclos desde este mes hasta encontrar uno que no haya
  // pasado. Con 13 vueltas se cubre hasta un anual completo de sobra.
  for (let i = 0; i < 13; i += 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = cursor.getMonth() + 1;
    if (!isDueInMonth(frequency, anchorMonth, month)) continue;
    const diasDelMes = new Date(cursor.getFullYear(), month, 0).getDate();
    const fecha = new Date(cursor.getFullYear(), month - 1, Math.min(dueDay, diasDelMes));
    if (fecha >= hoy) return fecha;
  }

  // Todo el año ya pasó: el siguiente cae un ciclo más adelante.
  const salto = new Date(now.getFullYear(), now.getMonth() + every, 1);
  const diasDelMes = new Date(salto.getFullYear(), salto.getMonth() + 1, 0).getDate();
  return new Date(salto.getFullYear(), salto.getMonth(), Math.min(dueDay, diasDelMes));
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
