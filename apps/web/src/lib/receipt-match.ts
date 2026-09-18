/**
 * receipt-match.ts
 * Maps a raw OCR receipt line-item name to a product in the user's catalog.
 *
 * Receipt names are short, upper-cased and noisy ("COCA COLA 2L", "LECHE LALA 1L"),
 * while catalog names are the user's own wording ("Coca-Cola", "Leche"). We
 * normalise both sides, drop size/unit and stop-word tokens, then score by how
 * much of the (shorter) catalog name is covered by the receipt tokens, with a
 * Jaccard term and a whole-string containment bonus.
 *
 * Matching is deliberately conservative: when in doubt we return null so the
 * item stays "unlinked" for the user to confirm, rather than risk polluting the
 * statistics/predictions with a wrong product.
 *
 * Framework-free and deterministic so it can be unit-tested.
 */

import { canonicalWord, collapsePhrases } from './product-lexicon';

export interface MatchableProduct {
  readonly id: string;
  readonly name: string;
}

/** Articles / connectors that carry no matching signal in ES or EN. */
const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'y', 'a',
  'the', 'of', 'and', 'with', 'para',
]);

// A size / quantity token: "2l", "500g", "1gl", "1.5lt", "12pk", "6ct", "750ml",
// "c/u", or a bare number. These help nobody match and only add noise.
const SIZE_OR_NUMBER =
  /^\d+(?:[.,]\d+)?(?:kg|kgs|g|gr|grs|mg|ml|lt|lts|l|gl|oz|lb|lbs|pza|pzas|pz|pk|ct|un|cu)?$/i;

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '') // strip combining accent marks
    .replaceAll(/[^a-z0-9 ]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * El nombre normalizado y ademas traducido a una sola lengua.
 *
 * El catalogo esta en espanol y los recibos del super son en ingles: sin este
 * paso, «WATER» y «Agua» no comparten ni una palabra y la linea se queda sin
 * vincular —que es como el usuario acababa metiendo cada compra a mano—. Ver
 * `product-lexicon.ts` para el diccionario y sus limites.
 */
export function canonicalName(s: string): string {
  return collapsePhrases(normalizeName(s))
    .split(' ')
    .map(canonicalWord)
    .join(' ')
    .trim();
}

/** Significant tokens only — no stop-words, no size/quantity tokens, ≥ 2 chars. */
export function meaningfulTokens(s: string): string[] {
  return canonicalName(s)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !SIZE_OR_NUMBER.test(t));
}

function scoreMatch(
  receiptTokens: readonly string[],
  productTokens: readonly string[],
  normReceipt: string,
  normProduct: string,
): number {
  if (productTokens.length === 0 || receiptTokens.length === 0) return 0;

  const rset = new Set(receiptTokens);
  let shared = 0;
  for (const t of productTokens) if (rset.has(t)) shared += 1;
  if (shared === 0) {
    // No shared token — only a clean whole-string containment can rescue it.
    return normProduct.length >= 4 && normReceipt.includes(normProduct) ? 0.6 : 0;
  }

  const coverage = shared / productTokens.length; // how much of the catalog name is present
  const union = new Set([...receiptTokens, ...productTokens]).size || 1;
  const jaccard = shared / union;
  let score = coverage * 0.7 + jaccard * 0.3;

  // Whole-name containment is a strong signal ("coca cola" ⊂ "coca cola 2l").
  if (
    normProduct.length >= 4 &&
    (normReceipt.includes(normProduct) || normProduct.includes(normReceipt))
  ) {
    score = Math.max(score, 0.85);
  }

  return score;
}

/** Minimum score to accept a match; below this the item is left for the user. */
export const ACCEPT_THRESHOLD = 0.5;

export interface ReceiptMatch<T> {
  readonly product: T;
  readonly score: number;
}

/**
 * La clave con la que se guarda y se busca un alias aprendido.
 *
 * Tiene que ser la MISMA a un lado y otro —al guardar lo que el usuario
 * vinculó y al leer la línea del próximo recibo—, así que pasa por la misma
 * canonización. Gracias a eso «WATER 1GL» y «water» caen en la misma clave y
 * enseñar el producto una vez vale para las dos formas.
 */
export function aliasKey(rawName: string): string {
  return canonicalName(rawName);
}

/**
 * Best catalog match for a raw receipt name, or null when nothing clears the
 * acceptance threshold. Ties break toward the first product scanned.
 *
 * `aliases` son las vinculaciones que el usuario ya hizo a mano (clave de
 * `aliasKey` → id de producto). Mandan sobre el parecido de las palabras y sin
 * discusión: si el dueño de la despensa dijo que «GV PURIF WTR» es su Agua, no
 * hay heurística que deba llevarle la contraria. Es lo que cubre lo que ningún
 * diccionario sabe —sus marcas y las abreviaturas de su tienda—.
 */
export function matchReceiptItem<T extends MatchableProduct>(
  rawName: string,
  products: readonly T[],
  aliases?: ReadonlyMap<string, string>,
): ReceiptMatch<T> | null {
  if (aliases !== undefined && aliases.size > 0) {
    const aprendido = aliases.get(aliasKey(rawName));
    if (aprendido !== undefined) {
      const producto = products.find((p) => p.id === aprendido);
      // Si el producto ya no existe (lo borró), el alias huérfano se ignora y
      // se sigue por el camino normal.
      if (producto !== undefined) return { product: producto, score: 1 };
    }
  }

  const normReceipt = canonicalName(rawName);
  const receiptTokens = meaningfulTokens(rawName);
  if (receiptTokens.length === 0) return null;

  let best: ReceiptMatch<T> | null = null;
  for (const p of products) {
    const normProduct = canonicalName(p.name);
    const productTokens = meaningfulTokens(p.name);
    const score = scoreMatch(receiptTokens, productTokens, normReceipt, normProduct);
    if (score >= ACCEPT_THRESHOLD && (best === null || score > best.score)) {
      best = { product: p, score };
    }
  }
  return best;
}
