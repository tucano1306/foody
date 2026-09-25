/**
 * app-time.ts — qué día era una compra, visto desde Miami.
 *
 * La app vive en Miami, pero el servidor (Vercel) y la base (Neon, en GMT)
 * trabajan en UTC. Las fechas de compra llegan de dos maneras distintas:
 *
 *  - SOLO FECHA: los tickets que se meten con el calendario se guardan a
 *    medianoche UTC del día elegido. Leídos en hora de Miami serían las 8 de la
 *    noche del día ANTERIOR, así que esos se leen en UTC.
 *  - UN INSTANTE: cerrar la compra en Súper guarda la hora real. Esos se leen
 *    en Miami. Leídos en UTC, todo lo comprado entre las 8 de la noche y la
 *    medianoche salía con el día siguiente: un Publix del 6 de septiembre a las
 *    22:43 aparecía como «07 sep», y un Walmart del 12 de agosto a las 23:03
 *    como «13 ago».
 *
 * Una medianoche UTC exacta, al milisegundo, es la marca de «solo fecha»: una
 * compra real que cayera justo en ese instante es prácticamente imposible.
 *
 * Módulo PURO. Se prueba en app-time.test.ts.
 */

/** Miami. Nueva York es la zona IANA que la representa, con su horario de verano. */
export const APP_TZ = 'America/New_York';

/** ¿Es una fecha sin hora, guardada a medianoche UTC? */
export function esSoloFecha(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/** La zona en la que hay que leer esta fecha para que diga el día correcto. */
export function zonaDeLaFecha(iso: string): string {
  return esSoloFecha(iso) ? 'UTC' : APP_TZ;
}

/** La fecha formateada, en la zona que le toca. `opts` sin `timeZone`. */
export function formatFecha(
  iso: string,
  opts: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
  locale = 'es-MX',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: zonaDeLaFecha(iso) }).format(d);
}

type Dia = { year: number; month: number; day: number };

function diaEn(d: Date, timeZone: string): Dia {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { year: valor('year'), month: valor('month'), day: valor('day') };
}

/** Año, mes (1-12) y día de la fecha, en la zona que le toca. */
export function diaDeLaFecha(iso: string): Dia | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return diaEn(d, zonaDeLaFecha(iso));
}

/**
 * Cuándo fue, en corto: «hoy», «ayer», «20 jul» o, si fue otro año, «oct 2025».
 *
 * Es lo que va debajo del precio en la tarjeta de producto, que en la rejilla
 * de Casa deja ~70px útiles en un móvil de 360px. «hace 2 meses» ocupa 80 y
 * «hace 11 meses» 88: salían cortados en «hace 2 mese…». Una fecha corta cabe
 * siempre —la más ancha, «dic 2025», ronda los 52— y además dice más.
 *
 * Los días se cuentan en el calendario de Miami, no por horas: lo comprado
 * anoche a las 23:00 es «ayer» aunque haya pasado una hora.
 */
export function cuandoFue(iso: string, ahora: Date = new Date()): string {
  const dia = diaDeLaFecha(iso);
  if (!dia) return '';
  const hoy = diaEn(ahora, APP_TZ);
  const numero = (d: Dia) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
  const dias = numero(hoy) - numero(dia);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return dia.year === hoy.year
    ? formatFecha(iso, { day: 'numeric', month: 'short' })
    : formatFecha(iso, { month: 'short', year: 'numeric' });
}

/**
 * El `value` de un <input type="date"> para esta fecha: «2026-09-06».
 *
 * Se cortaba el ISO por la mitad (`iso.slice(0, 10)`), que es el día en UTC.
 * Para una compra de Súper de las 22:43 del 6 de septiembre eso es el 7, y
 * abrirla para editar y guardar sin tocar nada la MOVÍA al día siguiente.
 */
export function aCampoDeFecha(iso: string): string {
  const d = diaDeLaFecha(iso);
  if (!d) return iso.slice(0, 10);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}
