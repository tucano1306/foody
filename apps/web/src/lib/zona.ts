/**
 * zona.ts — en qué hora vive el usuario.
 *
 * La app decide «hoy» y «este mes» a cada rato: el Plan resta lo gastado ESTE
 * mes, un pago dice cuántos días faltan, Estadísticas agrupa por mes. En el
 * navegador eso salía bien, porque el navegador está en la hora del teléfono.
 * En el servidor no: Vercel y Neon trabajan en UTC, y en Miami eso va cuatro
 * horas por delante. De 8 de la noche a medianoche el servidor ya vivía en
 * mañana, y la última noche de cada mes, en el mes siguiente.
 *
 * La hora que manda es la del DISPOSITIVO —teléfono o laptop—, no una fija: si
 * el usuario viaja, la app se va con él. El navegador la deja en la cookie
 * `foody_tz` (ver ZonaHoraria.tsx) y el servidor la lee de ahí.
 *
 * Módulo PURO, sirve en los dos lados. Se prueba en zona.test.ts.
 */

/** Antes de que el dispositivo diga la suya: la casa del usuario, Miami. */
export const ZONA_POR_DEFECTO = 'America/New_York';

export const COOKIE_ZONA = 'foody_tz';

/**
 * La zona tal cual la entiende `Intl`, o null si no es una zona.
 *
 * Viene de una cookie, así que se valida siempre: va a parar a consultas SQL
 * (como parámetro, nunca pegada al texto) y a `Intl`, que lanza con una zona
 * que no conoce.
 */
export function zonaValida(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: valor }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** La zona en la que está este navegador. */
export function zonaDelDispositivo(): string {
  return zonaValida(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? ZONA_POR_DEFECTO;
}

/**
 * El mismo instante, como lo marcaría un reloj de pared en `zona`.
 *
 * Los motores de pagos, deudas y el Plan cuentan el calendario con los métodos
 * locales de `Date` (`getMonth()`, `getDate()`…) y claves «YYYY-MM-DD». Es lo
 * correcto en el navegador. En el servidor, «local» es UTC, así que se les da
 * un `now` cuyos campos locales son los del reloj del usuario: a las 22:00 del
 * 30 de septiembre en Miami, `getMonth()` dice septiembre y no octubre.
 *
 * SOLO para contar el calendario. No es un instante real: no se guarda en la
 * base ni se compara con fechas de la base sin pasarlas también por aquí.
 */
export function horaDePared(instante: Date, zona: string): Date {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  return new Date(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
    valor('second'),
    instante.getMilliseconds(),
  );
}

/**
 * El día que marcan los campos locales de `d`, como mediodía UTC.
 *
 * Para mandar al navegador un DÍA calculado con la hora de pared —la próxima
 * fecha de un pago—. `toISOString()` daría la medianoche UTC de ese día, que
 * en América se lee como el día anterior; el mediodía UTC cae en el mismo día
 * en cualquier zona de UTC−11 a UTC+11.
 */
export function mediodiaDelDia(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)).toISOString();
}
