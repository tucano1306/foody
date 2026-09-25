/**
 * app-time.ts — qué día era una compra, visto desde donde está el usuario.
 *
 * La zona la pone el dispositivo (ver zona.ts): todas estas funciones la
 * reciben, y los componentes la sacan de `useZonaHoraria()`.
 *
 * Las fechas de compra llegan de dos maneras:
 *
 *  - UN INSTANTE: cerrar la compra en Súper guarda la hora real. Se lee en la
 *    zona del usuario. Leído en UTC, lo comprado entre las 8 de la noche y la
 *    medianoche de Miami salía con el día siguiente: un Publix del 6 de
 *    septiembre a las 22:43 aparecía como «07 sep».
 *  - SOLO UN DÍA: lo que se elige en el calendario. Se guarda a MEDIODÍA UTC
 *    del día elegido (`deCampoDeFecha`), que cae ese mismo día en cualquier
 *    zona de UTC−11 a UTC+11. Así se lee como cualquier otra fecha, en la zona
 *    del usuario, y el servidor puede agrupar por mes sin casos aparte.
 *
 * Hasta septiembre de 2026 esos días se guardaban a MEDIANOCHE UTC, que en
 * Miami es la noche del día anterior. Se migraron a mediodía; lo que siga
 * llegando a medianoche exacta —una versión vieja de la app en un teléfono— se
 * lee en UTC para no cambiarle el día, y las rutas lo pasan a mediodía al
 * guardarlo (`normalizarSoloFecha`).
 *
 * Módulo PURO. Se prueba en app-time.test.ts.
 */

/** ¿Es una fecha sin hora, guardada a medianoche UTC al estilo antiguo? */
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
export function zonaDeLaFecha(iso: string, zona: string): string {
  return esSoloFecha(iso) ? 'UTC' : zona;
}

/** La fecha formateada, en la zona que le toca. `opts` sin `timeZone`. */
export function formatFecha(
  iso: string,
  opts: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
  zona: string,
  locale = 'es-MX',
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: zonaDeLaFecha(iso, zona) }).format(d);
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
export function diaDeLaFecha(iso: string, zona: string): Dia | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return diaEn(d, zonaDeLaFecha(iso, zona));
}

/**
 * Cuándo fue, en corto: «hoy», «ayer», «20 jul» o, si fue otro año, «oct 2025».
 *
 * Es lo que va debajo del precio en la tarjeta de producto, que en la rejilla
 * de Casa deja ~70px útiles en un móvil de 360px. «hace 2 meses» ocupa 80 y
 * «hace 11 meses» 88: salían cortados en «hace 2 mese…». Una fecha corta cabe
 * siempre —la más ancha, «dic 2025», ronda los 52— y además dice más.
 *
 * Los días se cuentan en el calendario del usuario, no por horas: lo comprado
 * anoche a las 23:00 es «ayer» aunque haya pasado una hora.
 */
export function cuandoFue(iso: string, zona: string, ahora: Date = new Date()): string {
  const dia = diaDeLaFecha(iso, zona);
  if (!dia) return '';
  const hoy = diaEn(ahora, zona);
  const numero = (d: Dia) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;
  const dias = numero(hoy) - numero(dia);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return dia.year === hoy.year
    ? formatFecha(iso, { day: 'numeric', month: 'short' }, zona)
    : formatFecha(iso, { month: 'short', year: 'numeric' }, zona);
}

/**
 * El `value` de un <input type="date"> para esta fecha: «2026-09-06».
 *
 * Se cortaba el ISO por la mitad (`iso.slice(0, 10)`), que es el día en UTC.
 * Para una compra de Súper de las 22:43 del 6 de septiembre eso es el 7, y
 * abrirla para editar y guardar sin tocar nada la MOVÍA al día siguiente.
 */
export function aCampoDeFecha(iso: string, zona: string): string {
  const d = diaDeLaFecha(iso, zona);
  if (!d) return iso.slice(0, 10);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/**
 * Lo que se guarda para un día elegido en el calendario: su mediodía UTC.
 *
 * `new Date('2026-09-06')` es la medianoche UTC, que en Miami son las 20:00
 * del día 5: el servidor, contando en la zona del usuario, la metía en el día
 * —y a veces en el mes— anterior.
 */
export function deCampoDeFecha(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  // Date.UTC acepta «2026-02-31» y lo lleva a marzo; eso no es el día elegido.
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d.toISOString();
}

/**
 * Para las rutas que guardan una fecha de compra: si llega a medianoche UTC
 * exacta —la forma antigua de «solo un día», de una versión vieja de la app—,
 * se pasa a mediodía de ese mismo día. Cualquier otra hora es un instante real
 * y se guarda tal cual.
 */
export function normalizarSoloFecha(iso: string): string {
  if (!esSoloFecha(iso)) return iso;
  return new Date(new Date(iso).getTime() + 12 * 3_600_000).toISOString();
}
