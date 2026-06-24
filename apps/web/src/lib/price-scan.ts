/**
 * Pure OCR price-extraction logic for the supermarket price scanner.
 *
 * The hard part of "read the price accurately" is not reading characters — it is
 * deciding WHICH number on a shelf tag is the price. A tag usually shows several
 * numbers (price per kg, old price, quantity, a product code…). The real price is
 * almost always the one printed in the LARGEST digits. So instead of taking the
 * first number in reading order, we use Tesseract's per-word geometry (bounding
 * box height) and confidence to score candidates and surface the biggest, most
 * confident price first.
 *
 * Everything here is framework-free and deterministic so it can be unit-tested.
 */

export type PriceQuality = 'strong' | 'weak' | 'none';

// ─── Image preprocessing (operate on raw pixel buffers) ──────────────────────

/** Otsu's method — optimal global B/W threshold from a 256-bin greyscale histogram. */
export function otsuThreshold(hist: readonly number[], total: number): number {
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

/** Greyscale + Otsu binarisation in place — gives Tesseract crisp black-on-white. */
export function binarize(imageData: ImageData): void {
  const d = imageData.data;
  const grey = new Uint8Array(d.length / 4);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    grey[p] = g;
    hist[g]++;
  }
  const threshold = otsuThreshold(hist, grey.length);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = grey[p] >= threshold ? 255 : 0;
    d[i] = v; d[i + 1] = v; d[i + 2] = v;
  }
}

/**
 * Target longest-side size. Tesseract reads best when digits are tall, so we
 * upscale small shots and only cap very large ones (mobile WASM memory).
 */
export function ocrScale(longest: number): number {
  const MAX_PX = 1800;
  const MIN_PX = 1200;
  if (longest > MAX_PX) return MAX_PX / longest;
  if (longest < MIN_PX) return MIN_PX / longest;
  return 1;
}

// ─── OCR geometry types (subset of tesseract.js Page) ────────────────────────

export interface OcrBbox { x0: number; y0: number; x1: number; y1: number }
export interface OcrWord { text: string; confidence: number; bbox: OcrBbox }
export interface OcrLine { words?: OcrWord[] }
export interface OcrParagraph { lines?: OcrLine[] }
export interface OcrBlock { paragraphs?: OcrParagraph[] }

/** A recognised word reduced to what we need for scoring. */
export interface ScanWord {
  /** Whitespace-stripped recognised text. */
  text: string;
  /** Tesseract confidence, 0–100. */
  confidence: number;
  /** Digit height in px (bounding box) — our proxy for "how big the price is". */
  height: number;
  x0: number;
  x1: number;
  /** Sequential line index, used to detect split dollars/cents on the same line. */
  line: number;
}

/** Flatten Tesseract blocks → words, keeping geometry. Defensive against nulls. */
export function flattenWords(blocks: OcrBlock[] | null | undefined): ScanWord[] {
  const out: ScanWord[] = [];
  if (!blocks) return out;
  let line = 0;
  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const ln of para.lines ?? []) {
        for (const w of ln.words ?? []) {
          const text = (w.text ?? '').replaceAll(/\s+/g, '');
          if (!text) continue;
          const height = Math.max(1, w.bbox.y1 - w.bbox.y0);
          out.push({ text, confidence: w.confidence ?? 0, height, x0: w.bbox.x0, x1: w.bbox.x1, line });
        }
        line++;
      }
    }
  }
  return out;
}

// ─── Candidate extraction from word geometry ─────────────────────────────────

export interface PriceCandidate {
  value: number;
  /** Had a strong signal: a "$", a decimal separator, or a split dollars/cents pair. */
  strong: boolean;
  height: number;
  confidence: number;
  score: number;
}

export interface ScanSummary {
  /** Candidate prices, best-first. */
  prices: number[];
  quality: PriceQuality;
  /** Value to pre-select, or null when the user must choose. */
  autoSelect: number | null;
}

// Score weights — digit size dominates (the price is the biggest number), with
// confidence and a strong-signal bonus as tie-breakers.
const W_SIZE = 1.0;
const W_CONF = 0.4;
const W_STRONG = 0.5;
const MAX_PRICE = 100_000;

// "12.99", "12,99", "1,299.00", "1.299,00", "$12.99" → integer part (sep-aware) + 2 cents
const DECIMAL_PRICE = /^\$?(\d{1,3}(?:[.,]\d{3})+|\d{1,6})[.,](\d{2})$/;
// "$12.9" / "12,9" — OCR sometimes drops a cents digit; keep as a strong-ish read
const LOOSE_DECIMAL = /^\$?(\d{1,6})[.,](\d)$/;
const DOLLAR_INT = /^\$(\d{1,6})$/;
const BARE_INT = /^(\d{1,6})$/;
const TWO_DIGITS = /^\d{2}$/;

/** Remove thousands separators and parse the integer part. */
function intPart(s: string): number {
  return Number.parseInt(s.replaceAll(/[.,]/g, ''), 10);
}

function makeCandidate(value: number, strong: boolean, w: ScanWord, maxHeight: number): PriceCandidate | null {
  if (!(value > 0) || value >= MAX_PRICE) return null;
  const sizeScore = w.height / maxHeight;
  const confScore = Math.max(0, Math.min(1, w.confidence / 100));
  const score = sizeScore * W_SIZE + confScore * W_CONF + (strong ? W_STRONG : 0);
  return { value, strong, height: w.height, confidence: w.confidence, score };
}

/** Keep only the highest-scoring candidate per distinct value. */
function dedupeByValue(cands: PriceCandidate[]): PriceCandidate[] {
  const best = new Map<number, PriceCandidate>();
  for (const c of cands) {
    const prev = best.get(c.value);
    if (!prev || c.score > prev.score) best.set(c.value, c);
  }
  return [...best.values()];
}

/**
 * Build scored price candidates from recognised words.
 *
 * Handles: plain decimals ($12.99 / 12,99 / 1,299.00), bare integers, and the
 * common shelf-tag layout where dollars and cents are separate tokens
 * ("$3" + "99" → 3.99), preferring the combined price.
 */
export function buildCandidates(words: ScanWord[]): PriceCandidate[] {
  const digitWords = words.filter((w) => /\d/.test(w.text));
  if (digitWords.length === 0) return [];
  const maxHeight = Math.max(1, ...digitWords.map((w) => w.height));

  const cands: PriceCandidate[] = [];
  const consumed = new Set<number>();
  const push = (value: number, strong: boolean, w: ScanWord) => {
    const c = makeCandidate(value, strong, w, maxHeight);
    if (c) cands.push(c);
  };

  for (let i = 0; i < words.length; i++) {
    if (consumed.has(i)) continue;
    const w = words[i];
    const t = w.text;

    const dec = DECIMAL_PRICE.exec(t);
    if (dec) { push(intPart(dec[1]) + Number(dec[2]) / 100, true, w); continue; }

    const loose = LOOSE_DECIMAL.exec(t);
    if (loose) { push(intPart(loose[1]) + Number(loose[2]) / 10, true, w); continue; }

    const dollar = DOLLAR_INT.exec(t);
    const bare = BARE_INT.exec(t);
    if (dollar || bare) {
      const dollars = Number((dollar ?? bare)![1]);
      const hadDollar = Boolean(dollar);
      // Split dollars/cents: a following 2-digit token on the same line, to the right.
      const next = words[i + 1];
      if (next && !consumed.has(i + 1) && next.line === w.line && next.x0 >= w.x0 && TWO_DIGITS.test(next.text)) {
        consumed.add(i + 1);
        push(dollars + Number(next.text) / 100, true, w);
      } else {
        push(dollars, hadDollar, w);
      }
    }
  }

  return dedupeByValue(cands);
}

/** Reduce scored candidates to a sorted price list, quality, and an auto-select. */
export function summarize(cands: PriceCandidate[]): ScanSummary {
  if (cands.length === 0) return { prices: [], quality: 'none', autoSelect: null };
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const anyStrong = sorted.some((c) => c.strong);
  const top = sorted[0];
  return {
    prices: sorted.map((c) => c.value),
    quality: anyStrong ? 'strong' : 'weak',
    // Only pre-select when the best candidate carries a strong signal; otherwise
    // (bare integers only) make the user confirm.
    autoSelect: top.strong ? top.value : null,
  };
}

// ─── Text fallback (used when geometry is unavailable) ───────────────────────

export interface PriceExtraction {
  readonly prices: readonly number[];
  readonly quality: PriceQuality;
  readonly hasDigits: boolean;
}

// Numbers that look like a price but almost never are:
//  - 4-digit years (1900-2099) without currency / decimal
//  - numbers attached to %  (e.g. "100%")
function isLikelyNonPrice(raw: string, context: string, index: number): boolean {
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1900 && n <= 2099 && raw.length === 4) return true;
  const after = context.slice(index + raw.length, index + raw.length + 2);
  if (after.trimStart().startsWith('%')) return true;
  return false;
}

type PushFn = (bucket: number[], raw: string) => void;

/** Strong signals: explicit "$", a decimal separator, or split dollars/cents. */
function collectStrongPrices(text: string, strong: number[], push: PushFn): void {
  for (const m of text.matchAll(/\$\s*(\d{1,5}(?:[.,]\d{1,2})?)/g)) push(strong, m[1]);
  for (const m of text.matchAll(/\b(\d{1,4}[.,]\d{2})\b/g)) push(strong, m[1]);
  for (const m of text.matchAll(/\$\s*(\d{1,3})\s+(\d{2})\b/g)) push(strong, `${m[1]}.${m[2]}`);
}

/** Weak signal: bare integers — only meaningful when no strong price was found. */
function collectWeakPrices(text: string, weak: number[], push: PushFn): void {
  for (const m of text.matchAll(/\b(\d{2,4})\b/g)) {
    if (m.index === undefined) continue;
    if (isLikelyNonPrice(m[1], text, m.index)) continue;
    push(weak, m[1]);
  }
}

export function extractPrices(text: string): PriceExtraction {
  const strong: number[] = [];
  const weak: number[] = [];
  const seen = new Set<number>();
  const hasDigits = /\d/.test(text);

  const push: PushFn = (bucket, raw) => {
    const n = Number.parseFloat(raw.replaceAll(',', '.'));
    if (!Number.isNaN(n) && n > 0 && n < 10_000 && !seen.has(n)) {
      seen.add(n);
      bucket.push(n);
    }
  };

  collectStrongPrices(text, strong, push);
  if (strong.length === 0) collectWeakPrices(text, weak, push);

  const quality: PriceQuality = strong.length > 0 ? 'strong' : weak.length > 0 ? 'weak' : 'none';
  return { prices: strong.length > 0 ? strong : weak, quality, hasDigits };
}
