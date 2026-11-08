import { normalizeExpenseKind, type ExpenseKind } from './expense-kind';

/**
 * Tiendas: el nombre con que se guarda cada compra y cómo se juntan las que
 * son la misma.
 *
 * Hasta noviembre de 2026 la tienda se escribía a mano al cerrar la compra, y
 * en 75 compras salieron 31 nombres: «Publix» y «publix», cinco formas de
 * escribir CVS, «7eleven» y «7-Eleven». Las estadísticas por tienda salían
 * partidas. Aquí vive la regla de qué cuenta como «el mismo nombre», sin SQL
 * ni React, para que la usen igual la base, el Súper y la pantalla de Tiendas.
 *
 * Una «tienda» es un NOMBRE (lo que se guarda en `store_name` de cada compra).
 * Una «sucursal» es una fila de `stores`: ese nombre en un sitio concreto, con
 * sus coordenadas. Publix puede tener dos sucursales; las compras siguen
 * diciendo «Publix», así que las estadísticas no cambian.
 */

export interface UsoDeTienda {
  readonly nombre: string;
  /** De qué clase fueron esas compras; un mismo Publix puede ser súper y farmacia. */
  readonly kind: ExpenseKind | string | null;
  readonly usos: number;
  /** ISO de la última compra con ese nombre, o null. */
  readonly ultima: string | null;
}

export interface Sucursal {
  readonly id: string;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface TiendaResumen {
  readonly nombre: string;
  readonly usos: number;
  readonly ultima: string | null;
  /** La clase de gasto más frecuente con este nombre: da el emoji de la lista. */
  readonly kind: ExpenseKind;
  readonly sucursales: readonly Sucursal[];
}

export interface GrupoRepetido {
  /** El nombre que se propone dejar. */
  readonly nombre: string;
  /** Todas las formas en que está escrito, la más usada primero. */
  readonly variantes: readonly { readonly nombre: string; readonly usos: number }[];
}

export const LARGO_MAXIMO_NOMBRE = 255;

/**
 * Palabras que, AL FINAL del nombre, no cambian de qué tienda se trata:
 * «CVS Pharmacy» es CVS y «Walmart Supercenter» es Walmart. Solo al final:
 * en «farmacia Camalihe» la palabra genérica va delante y el nombre propio es
 * lo que sigue, así que se deja como está.
 */
const GENERICAS_AL_FINAL = new Set([
  'pharmacy',
  'farmacia',
  'supercenter',
  'supermarket',
  'supermercado',
  'market',
  'store',
  'stores',
  'tienda',
  'inc',
  'llc',
]);

/** El nombre como se va a guardar: sin espacios de sobra. Vacío → null. */
export function limpiarNombreTienda(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  return limpio.length > 0 ? limpio : null;
}

function palabras(nombre: string): string[] {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Clave EXACTA: el mismo nombre escrito con otras mayúsculas, espacios, tildes
 * o guiones. «7-Eleven» y «7eleven» comparten clave; «CVS» y «CVS Pharmacy» no.
 * Es lo que se usa para corregir solo, sin preguntar, un nombre recién escrito.
 */
export function claveDeTienda(nombre: string): string {
  return palabras(nombre).join('');
}

/**
 * Raíz: la clave sin las palabras genéricas ni el número de local del final
 * («Publix #1234»). Junta más que la clave, así que solo sirve para PROPONER
 * uniones que el dueño confirma; nunca para cambiar un nombre por su cuenta.
 */
export function raizDeTienda(nombre: string): string {
  const p = palabras(nombre);
  while (p.length > 1 && (GENERICAS_AL_FINAL.has(p[p.length - 1]) || /^\d+$/.test(p[p.length - 1]))) {
    p.pop();
  }
  return p.join('');
}

/**
 * Corrige un nombre recién escrito a la forma en que ya existe: escribir
 * «publix» guarda «Publix» si «Publix» es como ya está. `conocidos` va
 * ordenado por uso, así que gana la forma más usada.
 *
 * Solo por clave exacta. «CVS Pharmacy» no se convierte en «CVS» sin que el
 * dueño lo diga: podría ser otra tienda, y equivocarse aquí mezcla gastos.
 */
export function canonizarNombre(nombre: unknown, conocidos: readonly string[]): string | null {
  const limpio = limpiarNombreTienda(nombre);
  if (!limpio) return null;
  const clave = claveDeTienda(limpio);
  // Un nombre hecho solo de símbolos no tiene clave; compararlo uniría «???»
  // con «!!!». Se guarda tal cual.
  if (!clave) return limpio;
  return conocidos.find((k) => claveDeTienda(k) === clave) ?? limpio;
}

/** Qué forma dejar cuando varias son la misma tienda. */
export function elegirNombre(variantes: readonly { readonly nombre: string; readonly usos: number }[]): string {
  const ordenadas = [...variantes].sort((a, b) => {
    if (b.usos !== a.usos) return b.usos - a.usos;
    // A igualdad de uso, la que tiene mayúsculas suele ser la bien escrita
    // («Chipotle» frente a «chipotle»).
    const mayA = /[A-Z]/.test(a.nombre) ? 1 : 0;
    const mayB = /[A-Z]/.test(b.nombre) ? 1 : 0;
    if (mayB !== mayA) return mayB - mayA;
    if (a.nombre.length !== b.nombre.length) return a.nombre.length - b.nombre.length;
    return a.nombre.localeCompare(b.nombre);
  });
  return ordenadas[0]?.nombre ?? '';
}

/**
 * Los nombres que parecen la misma tienda, para proponer unirlos. Un grupo
 * necesita al menos dos formas DISTINTAS: «Aldi» como súper y «Aldi» como
 * otro gasto ya es un solo nombre y no hay nada que unir.
 */
export function sugerirUniones(tiendas: readonly { readonly nombre: string; readonly usos: number }[]): GrupoRepetido[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const t of tiendas) {
    const nombre = limpiarNombreTienda(t.nombre);
    if (!nombre) continue;
    const raiz = raizDeTienda(nombre);
    // «Sin tienda» es la etiqueta de las compras sin nombre, no una tienda.
    if (!raiz || raiz === 'sintienda') continue;
    const grupo = grupos.get(raiz) ?? new Map<string, number>();
    grupo.set(nombre, (grupo.get(nombre) ?? 0) + Math.max(0, t.usos));
    grupos.set(raiz, grupo);
  }
  const salida: GrupoRepetido[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.size < 2) continue;
    const variantes = [...grupo.entries()]
      .map(([nombre, usos]) => ({ nombre, usos }))
      .sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre));
    salida.push({ nombre: elegirNombre(variantes), variantes });
  }
  const total = (g: GrupoRepetido) => g.variantes.reduce((s, v) => s + v.usos, 0);
  return salida.sort((a, b) => total(b) - total(a) || a.nombre.localeCompare(b.nombre));
}

/**
 * Junta las compras por nombre y les cuelga sus sucursales.
 *
 * Una sucursal se cuelga del nombre con su misma clave y más compras: si en
 * la base hay «Publix» (17) y «publix» (1) sin unir todavía, la sucursal va
 * con el de 17. Una sucursal sin compras todavía (recién guardada) sale como
 * tienda propia con 0 compras: si no, desaparecería de la lista.
 */
export function armarTiendas(usos: readonly UsoDeTienda[], sucursales: readonly Sucursal[]): TiendaResumen[] {
  interface Acumulado {
    nombre: string;
    usos: number;
    ultima: string | null;
    porKind: Map<ExpenseKind, number>;
    sucursales: Sucursal[];
  }
  const porNombre = new Map<string, Acumulado>();
  for (const u of usos) {
    const nombre = limpiarNombreTienda(u.nombre);
    if (!nombre) continue;
    const acc = porNombre.get(nombre) ?? { nombre, usos: 0, ultima: null, porKind: new Map(), sucursales: [] };
    const n = Math.max(0, Math.trunc(Number(u.usos) || 0));
    acc.usos += n;
    if (u.ultima && (!acc.ultima || u.ultima > acc.ultima)) acc.ultima = u.ultima;
    const kind = normalizeExpenseKind(u.kind);
    acc.porKind.set(kind, (acc.porKind.get(kind) ?? 0) + n);
    porNombre.set(nombre, acc);
  }

  for (const s of sucursales) {
    const nombre = limpiarNombreTienda(s.nombre);
    if (!nombre) continue;
    const clave = claveDeTienda(nombre);
    let destino: Acumulado | undefined;
    for (const acc of porNombre.values()) {
      if (claveDeTienda(acc.nombre) !== clave) continue;
      if (!destino || acc.usos > destino.usos) destino = acc;
    }
    if (!destino) {
      destino = { nombre, usos: 0, ultima: null, porKind: new Map(), sucursales: [] };
      porNombre.set(nombre, destino);
    }
    destino.sucursales.push({ ...s, nombre: destino.nombre });
  }

  return [...porNombre.values()]
    .map((acc) => {
      let kind: ExpenseKind = 'grocery';
      let max = -1;
      for (const [k, n] of acc.porKind) {
        if (n > max) {
          max = n;
          kind = k;
        }
      }
      return { nombre: acc.nombre, usos: acc.usos, ultima: acc.ultima, kind, sucursales: acc.sucursales };
    })
    .sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre));
}

/**
 * Lo que se escribe o se dicta en el selector del Súper: «voy a Publix»,
 * «estoy en el CVS». El asistente de voz no está montado, así que el «voy a…»
 * llega por el dictado del teclado, con la frase entera; aquí se queda solo
 * la tienda. Sin la frase delante, se devuelve tal cual.
 */
export function quitarVoyA(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  // Un espacio al final para que «voy a» a secas también case con la frase.
  const sin = `${limpio} `.replace(
    /^(?:(?:me\s+)?voy\s+(?:a\s+|al\s+|para\s+(?:el\s+|la\s+)?)|vamos\s+(?:a\s+|al\s+)|estoy\s+en\s+|ir\s+a\s+)(?:(?:el|la|los|las)\s+)?/i,
    '',
  );
  // «voy a» sin nada detrás: todavía no hay tienda que buscar.
  return sin.trim().replace(/[.!?¡¿,;:]+$/u, '').trim();
}

/**
 * Cómo se nombra una sucursal de un vistazo: «Publix · Biscayne Boulevard».
 * La calle sin el número de portal, que en una plaza de Florida es un 12800
 * que nadie recuerda; si no hay calle, solo el nombre.
 */
export function etiquetaSucursal(s: Pick<Sucursal, 'nombre' | 'direccion'>): string {
  const calle = lugarDeSucursal(s);
  return calle ? `${s.nombre} · ${calle}` : s.nombre;
}

/** Solo la parte del sitio: «Biscayne Boulevard». Null sin dirección. */
export function lugarDeSucursal(s: Pick<Sucursal, 'direccion'>): string | null {
  const primera = (s.direccion ?? '').split(',')[0]?.trim() ?? '';
  if (!primera) return null;
  const sinPortal = primera.replace(/^\d+[a-z]?\s+/i, '').trim();
  return sinPortal || primera;
}
