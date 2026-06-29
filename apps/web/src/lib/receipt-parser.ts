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

/**
 * Matches a monetary amount anywhere in a line, e.g. 3.99 / 129.00 / 1,299.00 /
 * 1.299,00 / -10.00. The first alternative captures amounts with thousands
 * separators ("1,299.00"); the second handles plain two-decimal amounts.
 */
const PRICE_RE = /[-−]?\d{1,3}(?:[.,]\d{3})+[.,]\d{2}(?:\s*[A-Z])?|[-−]?\d{1,6}[.,]\d{2}(?:\s*[A-Z])?/g;

/**
 * Lines that are definitely not product lines — split into groups to keep
 * complexity ≤ 20. Covers US (English) and MX (Spanish) receipt vocabulary.
 */
const SKIP_STORE = /^(phone|tel[.:]?|fax|store|sucursal|manager|gerente|cashier|cajer[oa]|caja|operator|server|clerk|associate|employee|thank|gracias|vuelva)/i;
const SKIP_FISCAL = /^(tax|iva|i\.v\.a|sales\s*tax|subtotal|sub-total|change|cambio|cash|efectivo|savings|ahorro|balance|amount\s+due|total\s+due|propina|tip|redondeo)/i;
const SKIP_DOC = /^(receipt|invoice|factura|folio|ticket|address|domicilio|rfc|approved|aprobad[oa]|authorized|autorizad[oa]|declined|pin|account|cuenta|member|socio|reward|puntos|point)/i;
const SKIP_IDENT = /^(date|fecha|time|hora|transaction|transacci|trans[.]?|ref[.]?|auth[.]?|chip|swipe|terminal)/i;
const SKIP_MISC = /^(barcode|www[.]|http|visa|mastercard|amex|discover|debit|d[ée]bito|credit|cr[ée]dito|card|tarjeta|ebt)/i;

function shouldSkipLine(line: string): boolean {
  return (
    SKIP_STORE.test(line) ||
    SKIP_FISCAL.test(line) ||
    SKIP_DOC.test(line) ||
    SKIP_IDENT.test(line) ||
    SKIP_MISC.test(line)
  );
}

/** Lines that must NOT count as the grand total even though they say 'total' */
const TOTAL_SKIP_RE = /subtotal|sub-total|sub\s+total|total\s+savings|total\s+discount|total\s+ahorro|points\s+total|tax\s+total|total\s+tax|total\s+iva|total\s+art[íi]culos|total\s+items|total\s+piezas|total\s+qty/i;

/**
 * The total label must sit at the START of the line (optionally after one known
 * qualifier like GRAND/ORDER), so a *product* whose name merely contains the
 * word "total" (e.g. "COLGATE TOTAL", "TOTAL cereal") is not mistaken for the
 * receipt total. The amount is extracted separately via extractPrices().
 */
const TOTAL_LABEL_RE = /^(grand|order|purchase|your|net|final|invoice)?\s*total\b|^(amount|balance|total)\s+due\b|^importe(\s+total)?\b|^total\s+a\s+pagar\b/i;

/** True when this line is the receipt's grand-total line. */
function isTotalLine(line: string): boolean {
  if (TOTAL_SKIP_RE.test(line)) return false;
  const text = line.replaceAll(PRICE_RE, ' ').replaceAll(/\s{2,}/g, ' ').trim();
  return TOTAL_LABEL_RE.test(text);
}

/**
 * Known supermarket / store chains.
 * Scanned in the first 10 lines so names like "PUBLIX #1476" are detected
 * even though the store number breaks STORE_NAME_RE.
 */
const KNOWN_CHAINS = [
  'publix', 'walmart', 'winn-dixie', 'winn dixie', 'target', 'kroger',
  'aldi', 'whole foods', 'trader joe', 'costco', "sam's club", "sam's",
  'food lion', 'harris teeter', 'safeway', 'albertsons', 'meijer',
  'h-e-b', 'heb', 'wegmans', 'stop & shop', 'giant eagle',
  'cvs', 'cvs pharmacy', 'walgreens', 'rite aid', 'dollar general',
  'dollar tree', 'family dollar', 'ross', 'tj maxx', 'marshalls',
  'soriana', 'chedraui', 'la comer', 'bodega aurrera', 'superama',
  'oxxo', 'seven eleven', '7-eleven',
];

function detectKnownChain(lines: string[]): string | null {
  for (const line of lines.slice(0, 10)) {
    const lower = line.toLowerCase();
    const hit = KNOWN_CHAINS.find((chain) => lower.includes(chain));
    if (hit !== undefined) {
      // Return only the matched chain name (capitalised), not "PUBLIX #1476 JACKSONVILLE FL"
      return hit.replace(/^./, (c) => c.toUpperCase());
    }
  }
  return null;
}

/** Qty × price or qty @ price:  "2 x 3.99"  "3 @ 12.50" */
const QTY_X_PRICE_RE = /(\d+(?:[.,]\d+)?)\s*[xX×@]\s*(\d+(?:[.,]\d+)?)/;

/** Leading quantity like "  2  PRODUCT NAME" */
const LEADING_QTY_RE = /^\s*(\d{1,3})\s{2,}(.+)/;

// ─── OCR correction ───────────────────────────────────────────────────────────

/**
 * Fix common OCR character confusions in a numeric context (price strings).
 * Applied only to the portion of a line that looks like a number.
 * E.g. "n,74" → "30,74" is hard to fix generically; instead we fix the
 * characters that Tesseract commonly swaps inside digit sequences:
 *   l/I/| → 1,  O/o/D → 0,  S/s → 5,  B → 8,  G → 6,  Z → 2
 */
function fixOcrDigits(s: string): string {
  return s
    .replaceAll(/(?<=[0-9,. ])l(?=[0-9,. ]|$)/g, '1')
    .replaceAll(/(?<=[0-9,. ])[Iī|](?=[0-9,. ]|$)/g, '1')
    .replaceAll(/(?<=[0-9,. ])[Oo](?=[0-9,. ]|$)/g, '0')
    .replaceAll(/(?<=[0-9,. ])S(?=[0-9,. ]|$)/g, '5')
    .replaceAll(/(?<=[0-9,. ])B(?=[0-9,. ]|$)/g, '8')
    .replaceAll(/(?<=[0-9,. ])G(?=[0-9,. ]|$)/g, '6')
    .replaceAll(/(?<=[0-9,. ])Z(?=[0-9,. ]|$)/g, '2');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMoney(raw: string): number | null {
  // Drop a trailing tax-flag letter (Walmart "O"/"N"/"X", Aldi "A"/"B", CVS "T"/"F")
  // BEFORE OCR digit-correction — otherwise fixOcrDigits turns "0.44 B" into
  // "0.44 8" → 0.448. PRICE_RE only ever appends a single such letter.
  const noFlag = raw.replace(/\s*[A-Za-z]\s*$/, '');
  const fixed = fixOcrDigits(noFlag);
  const stripped = fixed.replaceAll(/[^0-9.,-]/g, '');
  // The rightmost '.' or ',' is the decimal separator; everything before it is
  // the integer part (any other separators are thousands groupings).
  // Handles 1,299.00 / 1.299,00 / 234.56 / 12,99 alike.
  const decPos = Math.max(stripped.lastIndexOf('.'), stripped.lastIndexOf(','));
  let cleaned = stripped;
  if (decPos >= 0) {
    const intPart = stripped.slice(0, decPos).replaceAll(/[.,]/g, '');
    const fracPart = stripped.slice(decPos + 1).replaceAll(/[.,]/g, '');
    cleaned = `${intPart}.${fracPart}`;
  }
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
    .replaceAll(/^\*?\s*\d{1,6}\s+/g, '')
    // remove embedded UPC / PLU codes (runs of 5+ digits anywhere), e.g. Walmart
    // "GV WHL MILK 007874201234 F" → "GV WHL MILK F"
    .replaceAll(/\b\d{5,}\b/g, ' ')
    // remove a trailing lone tax-flag letter ("... MILK F")
    .replaceAll(/\s+[A-Za-z]\s*$/g, ' ')
    // remove trailing codes / quantity annotations
    .replaceAll(/\s+\d{1,6}\s*$/g, '')
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
  // The name is whatever text remains once the "qty × price" expression is
  // removed — works whether the name precedes it ("MILK 2 @ 3.00") or follows
  // it ("2 @ 3.00 ORANGE JUICE", common on Publix receipts).
  const namePart = line.replace(m[0], ' ');
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
  ctx: { total: number | null; storeName: string | null; receiptDate: string | null; awaitingTotal: boolean },
  items: ReceiptItem[],
): void {
  // Date extraction
  ctx.receiptDate ??= extractDate(line);

  // If the previous line was a TOTAL header with no inline price,
  // grab the first price we see on this line as the total.
  if (ctx.awaitingTotal) {
    ctx.awaitingTotal = false;
    const prices = extractPrices(line);
    if (prices.length > 0) { ctx.total = Math.max(...prices); return; }
  }

  // TOTAL detection — only when the line *starts* with a total label.
  if (isTotalLine(line)) {
    const prices = extractPrices(line);
    if (prices.length > 0) {
      ctx.total = Math.max(...prices);
    } else {
      // Price might be on the next line (e.g. "TOTAL\n54.82")
      ctx.awaitingTotal = true;
    }
    return;
  }

  // Skip header / footer lines
  if (shouldSkipLine(line)) return;

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
  // Pre-scan for known chains before the main loop so names like "PUBLIX #1476"
  // (which contain digits/# that break STORE_NAME_RE) are still captured.
  const ctx = { total: null as number | null, storeName: detectKnownChain(lines), receiptDate: null as string | null, awaitingTotal: false };

  for (const line of lines) {
    processLine(line, ctx, items);
  }

  // Fallback: if no total was found, take the largest price across any
  // total-labelled line (covers OCR that split the label and amount oddly).
  if (ctx.total === null) {
    for (const line of lines) {
      if (!isTotalLine(line)) continue;
      const prices = extractPrices(line);
      if (prices.length > 0) {
        const candidate = Math.max(...prices);
        if (ctx.total === null || candidate > ctx.total) ctx.total = candidate;
      }
    }
  }

  return { items, total: ctx.total, storeName: ctx.storeName, receiptDate: ctx.receiptDate };
}
