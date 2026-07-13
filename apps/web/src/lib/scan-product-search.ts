/**
 * scan-product-search.ts
 * Ranks the user's catalog against free-form text captured by the camera:
 * the OCR of a product label ("COCA-COLA\nZERO SUGAR\n355 mL") or the name
 * resolved from a barcode lookup ("Leche entera Lala 1L").
 *
 * Unlike receipt-match — which auto-links silently and must be conservative —
 * here the user picks from the candidate list, so we can afford to be more
 * permissive and return several ranked options.
 *
 * Framework-free and deterministic so it can be unit-tested.
 */

import { meaningfulTokens, normalizeName, type MatchableProduct } from './receipt-match';

export interface ScanCandidate<T> {
  readonly product: T;
  readonly score: number;
}

/** Minimum score for a product to appear among camera-search candidates. */
export const SCAN_MIN_SCORE = 0.45;

const DEFAULT_LIMIT = 5;

/**
 * OCR frequently joins or splits words ("CocaCola", "Choco late"), so besides
 * exact equality we accept containment for tokens long enough to be
 * distinctive.
 */
function tokenMatches(scanned: string, product: string): boolean {
  if (scanned === product) return true;
  if (product.length >= 4 && scanned.includes(product)) return true;
  if (scanned.length >= 4 && product.includes(scanned)) return true;
  return false;
}

/**
 * Products ranked by how much of their (short) catalog name appears in the
 * scanned text, best first. Ties break toward the more specific name (more
 * matched tokens), then catalog order.
 */
export function rankProductsByScanText<T extends MatchableProduct>(
  text: string,
  products: readonly T[],
  limit = DEFAULT_LIMIT,
): ScanCandidate<T>[] {
  const normText = normalizeName(text);
  const scanTokens = meaningfulTokens(text);
  if (scanTokens.length === 0) return [];

  const scored: Array<ScanCandidate<T> & { matched: number }> = [];
  for (const p of products) {
    const productTokens = meaningfulTokens(p.name);
    if (productTokens.length === 0) continue;

    let matched = 0;
    for (const pt of productTokens) {
      if (scanTokens.some((st) => tokenMatches(st, pt))) matched += 1;
    }

    // Full coverage caps at 0.9; whole-name containment is the strongest signal.
    let score = (matched / productTokens.length) * 0.9;
    const normProduct = normalizeName(p.name);
    if (normProduct.length >= 4 && normText.includes(normProduct)) {
      score = Math.max(score, 0.95);
    }

    if (score >= SCAN_MIN_SCORE) scored.push({ product: p, score, matched });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.matched - a.matched)
    .slice(0, limit)
    .map(({ product, score }) => ({ product, score }));
}
