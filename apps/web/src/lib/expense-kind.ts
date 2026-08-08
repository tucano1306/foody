/**
 * expense-kind.ts — clasifica un ticket: ¿es super, o es otro gasto?
 *
 * Una factura de un restaurante y un carrito del Walmart son las dos gasto
 * real, pero no son la misma cosa y no pueden vivir en el mismo sitio:
 *
 *  - El SUPER alimenta la despensa: precios por producto, stock, comparador de
 *    tiendas y el límite mensual de Presupuesto. Es la sección Compras.
 *  - Lo DEMÁS —comer fuera, la farmacia, la gasolina— no tiene productos que
 *    vincular ni precio que comparar. Es dinero que sale del mes y que el Plan
 *    Financiero tiene que restar de las metas, y nada más.
 *
 * Mezclarlos rompía las dos cosas: el promedio por ticket del super se ensuciaba
 * con comidas fuera, y esos gastos no aparecían en ningún lado del plan.
 *
 * Módulo PURO: sin SQL, sin React. Se prueba en expense-kind.test.ts.
 */
import type { ExpenseKind } from '@foody/types';

export type { ExpenseKind };

export interface ExpenseKindMeta {
  kind: ExpenseKind;
  emoji: string;
  /** Etiqueta corta para el selector — cabe en un chip de móvil. */
  label: string;
  /** Cómo se nombra el grupo en el plan ("Comida fuera: $84"). */
  groupLabel: string;
}

/**
 * El orden es el del selector. `grocery` va primero porque es el caso normal y
 * el que viene preseleccionado; `other` va último porque es el cajón de sastre.
 */
export const EXPENSE_KINDS: readonly ExpenseKindMeta[] = [
  { kind: 'grocery',  emoji: '🛒', label: 'Súper',    groupLabel: 'Súper' },
  { kind: 'dining',   emoji: '🍔', label: 'Comida',   groupLabel: 'Comida fuera' },
  { kind: 'pharmacy', emoji: '💊', label: 'Farmacia', groupLabel: 'Farmacia y salud' },
  { kind: 'fuel',     emoji: '⛽', label: 'Gasolina', groupLabel: 'Gasolina y transporte' },
  { kind: 'home',     emoji: '🔧', label: 'Hogar',    groupLabel: 'Hogar y ferretería' },
  { kind: 'other',    emoji: '🧾', label: 'Otro',     groupLabel: 'Otros gastos' },
];

const BY_KIND = new Map<ExpenseKind, ExpenseKindMeta>(EXPENSE_KINDS.map((k) => [k.kind, k]));

export const DEFAULT_EXPENSE_KIND: ExpenseKind = 'grocery';

export function expenseKindMeta(kind: ExpenseKind): ExpenseKindMeta {
  return BY_KIND.get(kind) ?? EXPENSE_KINDS[0];
}

/** Solo el super vive en Compras y cuenta para el presupuesto de despensa. */
export function isGroceryKind(kind: ExpenseKind): boolean {
  return kind === 'grocery';
}

/**
 * Normaliza lo que llegue de la base o del cuerpo de una petición.
 *
 * Cae a `grocery` ante cualquier cosa rara —null, un valor viejo, basura— y eso
 * es deliberado: es como se comportaba la app antes de que existiera el tipo,
 * así que ningún ticket ya guardado cambia de sitio por un dato inesperado.
 */
export function normalizeExpenseKind(value: unknown): ExpenseKind {
  if (typeof value !== 'string') return DEFAULT_EXPENSE_KIND;
  const clean = value.trim().toLowerCase() as ExpenseKind;
  return BY_KIND.has(clean) ? clean : DEFAULT_EXPENSE_KIND;
}

/** Marcas diacríticas: "Café" y "Cafe" tienen que ser la misma palabra. */
const DIACRITICS = /[\u0300-\u036f]/g;
const NON_ALNUM = /[^a-z0-9&']+/g;

/** minúsculas, sin acentos, sin puntuación y con un espacio a cada lado. */
function normalizeText(value: string): string {
  const clean = value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(NON_ALNUM, ' ')
    .trim();
  return clean.length === 0 ? '' : ` ${clean} `;
}

/**
 * Palabras que delatan el tipo de negocio en el nombre de la tienda.
 *
 * Se recorre en orden y gana la PRIMERA que coincida, así que lo específico va
 * antes que lo genérico: "Super Pollo" tiene que dar comida y no super, y
 * "Walmart Pharmacy" tiene que dar farmacia aunque diga Walmart.
 *
 * Todas las claves son subcadenas de 4+ caracteres a propósito: las raíces
 * cortas ("bp", "ok") coinciden dentro de cualquier palabra y clasifican mal
 * más de lo que aciertan.
 */
const KEYWORDS: readonly { kind: ExpenseKind; words: readonly string[] }[] = [
  {
    kind: 'pharmacy',
    words: [
      'farmacia', 'pharmacy', 'drugstore', 'walgreens', 'rite aid', 'botica',
      'benavides', 'del ahorro', 'similares', 'clinica', 'hospital',
      'laboratorio', 'dental', 'optica',
    ],
  },
  {
    kind: 'dining',
    words: [
      'restaurant', 'pollo', 'chicken', 'burger', 'pizza', 'taco', 'taqueria',
      'sushi', 'grill', 'cantina', 'cafe', 'coffee', 'starbucks', 'dunkin',
      'mcdonald', 'wendy', 'subway', 'popeyes', 'chipotle', 'panda express',
      'domino', 'papa john', 'little caesar', 'chick fil a', 'five guys',
      'shake shack', 'olive garden', 'applebee', 'denny', 'ihop', 'panera',
      'wingstop', 'buffet', 'cocina', 'kitchen', 'bistro', 'diner',
      'steakhouse', 'marisquer', 'antojitos', 'fonda', 'food truck',
      'doordash', 'uber eats', 'ubereats', 'grubhub', 'rappi', 'postmates',
      'heladeria', 'creamery', 'bakery',
    ],
  },
  {
    kind: 'fuel',
    words: [
      'gasolin', 'gas station', 'shell', 'chevron', 'exxon', 'texaco', 'mobil',
      'sunoco', 'citgo', 'marathon', 'pemex', 'racetrac', 'wawa', 'quiktrip',
      'circle k', 'lyft', 'parking', 'estacionamiento', 'peaje', 'toll',
      'autopista', 'taller', 'llanter',
    ],
  },
  {
    kind: 'home',
    words: [
      'home depot', 'lowes', 'ikea', 'ferreter', 'hardware', 'menards',
      'truper', 'construrama', 'pintura', 'muebler', 'furniture', 'wayfair',
    ],
  },
  {
    kind: 'grocery',
    words: [
      'walmart', 'publix', 'kroger', 'aldi', 'lidl', 'costco', 'sams club',
      "sam's club", 'target', 'winn dixie', 'whole foods', 'trader joe',
      'food lion', 'safeway', 'albertsons', 'wegmans', 'meijer', 'sprouts',
      'fresh market', 'supermerc', 'mercado', 'market', 'grocer', 'abarrotes',
      'soriana', 'chedraui', 'bodega aurrera', 'la comer', 'oxxo',
      'carniceria', 'fruteria', 'super',
    ],
  },
];

/** Las claves se normalizan una sola vez, no en cada llamada. */
const NORMALIZED_KEYWORDS = KEYWORDS.map(({ kind, words }) => ({
  kind,
  needles: words.map((w) => normalizeText(w).trim()).filter((w) => w.length > 0),
}));

/**
 * Adivina el tipo de gasto por el nombre de la tienda.
 *
 * Devuelve `null` —y no `grocery`— cuando no reconoce nada: quien llama
 * distingue así entre "lo detecté" y "no sé, deja lo que ya había". Es la
 * diferencia entre una sugerencia y una imposición silenciosa.
 */
export function detectExpenseKind(storeName: string | null | undefined): ExpenseKind | null {
  if (typeof storeName !== 'string') return null;
  const haystack = normalizeText(storeName);
  if (haystack === '') return null;

  for (const { kind, needles } of NORMALIZED_KEYWORDS) {
    for (const needle of needles) {
      if (haystack.includes(needle)) return kind;
    }
  }
  return null;
}
