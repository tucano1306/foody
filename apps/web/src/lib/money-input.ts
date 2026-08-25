/**
 * money-input.ts — leer importes como los escribe una persona.
 *
 * El problema real que resuelve: `<input type="number">` usa SIEMPRE el punto
 * como separador decimal, sin importar el idioma del usuario ni del navegador.
 * Quien escribe «54.587,19» —como se escribe en español— ve cómo el navegador
 * se queda con «54.587» y tira el «,19» en silencio. El importe nunca llega
 * entero al código: se guarda 54,587 en vez de 54 587,19, mil veces menos.
 *
 * Nadie se entera hasta que el plan financiero dice que ganas 5 dólares al mes.
 *
 * Aquí se acepta la cadena TAL CUAL se teclea y se decide qué significa cada
 * separador. Las reglas, en orden:
 *
 *   1. Si aparecen los DOS separadores, el ÚLTIMO es el decimal.
 *        «54.587,19» → 54587.19      «54,587.19» → 54587.19
 *   2. Si el mismo separador aparece varias veces, es de millares.
 *        «1.234.567» → 1234567
 *   3. Si aparece uno solo, manda cuántas cifras lo siguen:
 *        exactamente 3  → millares    «54.587» → 54587
 *        cualquier otra → decimal     «54,5» → 54.5   «2,50» → 2.5
 *
 * La regla 3 es la única que adivina, y adivina hacia donde está el dinero: en
 * un campo de importes, «1.500» es mil quinientos mucho más a menudo que uno
 * con medio. Quien quiera un euro y medio escribe «1,50» o «1.5», que caen del
 * otro lado de la regla.
 */

/** Tope de seguridad, el mismo que valida el servidor. */
const MAX_AMOUNT = 99_999_999.99;

/**
 * Convierte lo tecleado en un número, o `null` si no hay importe válido.
 *
 * Devuelve `null` —y no 0— para lo que no se entiende: un 0 silencioso en un
 * campo de dinero es indistinguible de un importe de verdad y se cuela en las
 * cuentas sin que nadie lo note.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  return parse(input, false);
}

/**
 * Como `parseMoney`, pero acepta importes NEGATIVOS.
 *
 * Los hay legítimos: un aporte a una meta se puede corregir en negativo para
 * deshacer lo que se anotó de más. Se separa en dos funciones en vez de un
 * parámetro para que en cada sitio quede escrito si los negativos tienen
 * sentido o no — casi nunca lo tienen, y colarse uno en un sueldo o en el
 * precio de algo pasa desapercibido.
 */
export function parseSignedMoney(input: string | number | null | undefined): number | null {
  return parse(input, true);
}

function parse(input: string | number | null | undefined, allowNegative: boolean): number | null {
  if (typeof input === 'number') {
    const withinRange = Math.abs(input) <= MAX_AMOUNT && (allowNegative || input >= 0);
    return Number.isFinite(input) && withinRange ? Math.round(input * 100) / 100 : null;
  }
  if (typeof input !== 'string') return null;

  // Fuera símbolos de moneda, espacios (incluido el fino que insertan algunos
  // teclados como separador de millares) y cualquier letra suelta.
  const cleaned = input.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  // Un signo menos solo cuenta al principio; dentro es basura.
  if (cleaned.includes('-') && !cleaned.startsWith('-')) return null;

  const negative = cleaned.startsWith('-');
  const digits = negative ? cleaned.slice(1) : cleaned;
  if (!/^[\d.,]+$/.test(digits)) return null;

  const normalized = normalizeSeparators(digits);
  if (normalized === null) return null;

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;

  const signed = negative ? -value : value;
  if (!allowNegative && signed < 0) return null;
  if (Math.abs(signed) > MAX_AMOUNT) return null;

  return Math.round(signed * 100) / 100;
}

/** Deja la cadena con un punto decimal y sin separadores de millares. */
function normalizeSeparators(digits: string): string | null {
  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');

  // Regla 1: con los dos, el último manda.
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const thousands = decimalAt === lastDot ? ',' : '.';
    const decimal = decimalAt === lastDot ? '.' : ',';
    return digits.split(thousands).join('').replace(decimal, '.');
  }

  const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
  if (sep === null) return digits;

  const parts = digits.split(sep);

  // Regla 2: repetido, es de millares.
  if (parts.length > 2) return parts.join('');

  // Regla 3: decide cuántas cifras lo siguen.
  const after = parts[1] ?? '';
  return after.length === 3 ? parts.join('') : parts.join('.');
}

/**
 * ¿Puede esto llegar a ser un importe si el usuario sigue escribiendo?
 *
 * Sirve para NO pelearse con quien está a medio teclear: «54,» todavía no es un
 * número, pero borrar la coma mientras escribe sería insufrible.
 */
export function isPartialMoney(input: string): boolean {
  return input === '' || /^\d*[.,]?\d*$/.test(input.replace(/[^\d.,]/g, ''));
}
