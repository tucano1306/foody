/**
 * receipt-parser.ts
 * Parses raw OCR text from a supermarket receipt into structured line items.
 *
 * Supports US supermarket formats (Walmart, Publix, Aldi, Target, Kroger, etc.):
 *   WHOLE MILK 1GL             2  @ 3.98      7.96
 *   COCA COLA 2L                              2.49
 *   TOTAL                                    54.82
 *
 * Date format: MM/DD/YYYY (US primary). Falls back to DD/MM/YYYY when month > 12.
 */

export interface ReceiptItem {
  /** Raw text name extracted from the receipt */
  readonly name: string;
  readonly quantity: number;
  /** Unit price (total / quantity when computable) */
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
}

export interface ReceiptParseResult {
  readonly items: ReceiptItem[];
  readonly total: number | null;
  readonly storeName: string | null;
  readonly receiptDate: string | null; // ISO yyyy-MM-dd
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

/** Matches a monetary amount anywhere in a line, e.g. 3.99 / 129.00 / -10.00 */
const PRICE_RE = /[-−]?\d{1,6}[.,]\d{2}(?:\s*[A-Z])?/g;

/** Lines that are definitely not product lines — split into groups to keep complexity ≤ 20 */
const SKIP_STORE = /^(phone|tel[.:]?|fax|store|manager|cashier|operator|server|clerk|associate|employee|thank)/i;
const SKIP_FISCAL = /^(tax|sales\s*tax|subtotal|change|cash|savings|balance|amount\s+due|total\s+due)/i;
const SKIP_DOC = /^(receipt|invoice|address|approved|authorized|declined|pin|account|member|reward|point)/i;
const SKIP_IDENT = /^(date|time|transaction|trans[.]?|ref[.]?|auth[.]?|chip|swipe)/i;
const SKIP_MISC = /^(barcode|www[.]|http|visa|mastercard|amex|discover|debit|credit|card|ebt)/i;

function shouldSkipLine(line: string): boolean {
  return (
    SKIP_STORE.test(line) ||
    SKIP_FISCAL.test(line) ||
    SKIP_DOC.test(line) ||
    SKIP_IDENT.test(line) ||
    SKIP_MISC.test(line)
  );
}

/** Lines that look like a TOTAL */
const TOTAL_RE = /^\s*(?:total|total\s+paid|grand\s+total|amount\s+due|tot[.]?)\s+(.+)?$/i;

/** Lines that are clearly store headers (ALL CAPS, no digits) — US stores use plain ASCII */
const STORE_NAME_RE = /^[A-Z\s&.,'/\u002D]{5,60}$/;

/** Qty × price or qty @ price:  "2 x 3.99"  "3 @ 12.50" */
const QTY_X_PRICE_RE = /(\d+(?:[.,]\d+)?)\s*[xX×@]\s*(\d+(?:[.,]\d+)?)/;

/** Leading quantity like "  2  PRODUCT NAME" */
const LEADING_QTY_RE = /^\s*(\d{1,3})\s{2,}(.+)/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMoney(raw: string): number | null {
  const cleaned = raw.replaceAll(/[^0-9.,-]/g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function extractPrices(line: string): number[] {
  const matches = line.match(PRICE_RE) ?? [];
  return matches.map(parseMoney).filter((n): n is number => n !== null);
}

function cleanProductName(raw: string): string {
  return raw
    // remove leading item codes like "1234 " or "* "
    .replaceAll(/^\*?\s*\d{1,6}\s+/, '')
    // remove trailing codes / quantity annotations
    .replaceAll(/\s+\d{1,6}\s*$/, '')
    // normalise whitespace
    .replaceAll(/\s{2,}/g, ' ')
    .trim()
    // capitalise first letter
    .replace(/^./, (c) => c.toUpperCase());
}

function isValidProductName(name: string): boolean {
  if (name.length < 3 || name.length > 60) return false;
  // must have at least one letter
  if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(name)) return false;
  return true;
}

function extractDate(line: string): string | null {
  // US format: MM/DD/YYYY (primary for Walmart, Publix, Aldi)
  // Falls back to DD/MM/YYYY when first group > 12
  const DATE_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;
  const m = DATE_RE.exec(line);
  if (!m) return null;
  const a = Number.parseInt(m[1], 10);
  const b = Number.parseInt(m[2], 10);
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  // If first group is > 12 it must be day-first (DD/MM)
  const [month, day] = a > 12 ? [b, a] : [a, b];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Line-item extraction helpers ────────────────────────────────────────────

interface RawLineItem {
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  namePart: string;
}

function parseQtyXPrice(line: string): RawLineItem | null {
  const m = QTY_X_PRICE_RE.exec(line);
  if (!m) return null;
  const quantity = Number.parseFloat(m[1].replace(',', '.')) || 1;
  const unitPrice = parseMoney(m[2]);
  const totalPrice = unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100;
  const namePart = line.slice(0, line.indexOf(m[0]));
  return { quantity, unitPrice, totalPrice, namePart };
}

function parseLeadingQtyOrFlat(line: string, prices: number[]): RawLineItem {
  let quantity = 1;
  let namePart = line;

  const lq = LEADING_QTY_RE.exec(line);
  if (lq) {
    quantity = Number.parseInt(lq[1], 10) || 1;
    namePart = lq[2];
  }

  let unitPrice: number | null = null;
  let totalPrice: number | null = null;

  if (prices.length >= 2) {
    totalPrice = prices.at(-1) ?? null;
    unitPrice = totalPrice === null ? null : Math.round((totalPrice / quantity) * 100) / 100;
  } else if (prices.length === 1) {
    totalPrice = prices[0];
    unitPrice = quantity > 1 ? Math.round((totalPrice / quantity) * 100) / 100 : totalPrice;
  }

  return { quantity, unitPrice, totalPrice, namePart };
}

function parseProductLine(line: string): RawLineItem | null {
  const prices = extractPrices(line);
  if (prices.length === 0) return null;

  const qxp = parseQtyXPrice(line);
  const raw = qxp ?? parseLeadingQtyOrFlat(line, prices);

  const cleanedName = cleanProductName(raw.namePart.replaceAll(PRICE_RE, ''));
  if (!isValidProductName(cleanedName)) return null;

  // Sanity: skip zero or absurdly large prices
  if (raw.totalPrice !== null && (raw.totalPrice <= 0 || raw.totalPrice > 99_999)) return null;

  return { ...raw, namePart: cleanedName };
}

// ─── Main parser ──────────────────────────────────────────────────────────────

function processLine(
  line: string,
  ctx: { total: number | null; storeName: string | null; receiptDate: string | null; storeNameCandidates: number },
  items: ReceiptItem[],
): void {
  // Date extraction
  ctx.receiptDate ??= extractDate(line);

  // TOTAL detection
  if (TOTAL_RE.test(line)) {
    const prices = extractPrices(line);
    if (prices.length > 0) ctx.total = Math.max(...prices);
    return;
  }

  // Skip header / footer lines
  if (shouldSkipLine(line)) return;

  // Store name detection (first few ALL-CAPS lines with no price)
  if (ctx.storeNameCandidates < 3 && STORE_NAME_RE.test(line) && extractPrices(line).length === 0) {
    ctx.storeName ??= line.trim();
    ctx.storeNameCandidates++;
    return;
  }

  // Product line
  const parsed = parseProductLine(line);
  if (parsed === null) return;

  items.push({
    name: parsed.namePart,
    quantity: parsed.quantity,
    unitPrice: parsed.unitPrice,
    totalPrice: parsed.totalPrice,
  });
}

export function parseReceiptText(rawText: string): ReceiptParseResult {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ReceiptItem[] = [];
  const ctx = { total: null as number | null, storeName: null as string | null, receiptDate: null as string | null, storeNameCandidates: 0 };

  for (const line of lines) {
    processLine(line, ctx, items);
  }

  return { items, total: ctx.total, storeName: ctx.storeName, receiptDate: ctx.receiptDate };
}
