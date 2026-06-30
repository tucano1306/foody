import { describe, it, expect } from 'vitest';
import { parseReceiptText } from './receipt-parser';
import { matchReceiptItem, type MatchableProduct } from './receipt-match';

/**
 * End-to-end check of the scan pipeline: raw OCR text → parseReceiptText →
 * matchReceiptItem, reproducing exactly the linked/unlinked decision that
 * NewTripForm.handleReceiptResult makes. This is the path that turns a scan
 * into product_purchases (and therefore into statistics & predictions).
 */

interface CatalogProduct extends MatchableProduct {
  unit: string;
}

const catalog: CatalogProduct[] = [
  { id: 'milk', name: 'Milk', unit: 'gal' },
  { id: 'eggs', name: 'Eggs', unit: 'dozen' },
  { id: 'bread', name: 'Bread', unit: 'loaf' },
  { id: 'oj', name: 'Orange Juice', unit: 'unit' },
  { id: 'apple', name: 'Apples', unit: 'lb' }, // not on the receipt
];

// A realistic, noisy Walmart receipt: UPC codes, tax-flag letters, qty lines,
// a US MM/DD/YYYY date and the usual fiscal/footer clutter.
const rawOcr = [
  'Walmart',
  'Save money. Live better.',
  'ST# 01234 OP# 009 TE# 12 TR# 04567',
  'GV WHL MILK 007874201234 F 2.78 O',
  'GREAT VALUE EGGS 007874203912 N 3.42 O',
  'BREAD WHEAT 002890054321 2.50 X',
  '2 @ 3.00 ORANGE JUICE 6.00',
  'COLGATE TOTAL 009382011112 T 4.99 X',
  'SUBTOTAL 19.69',
  'TAX 1 1.38',
  'TOTAL 21.07',
  'DEBIT TEND 21.07',
  'CHANGE DUE 0.00',
  '12/28/2025 19:45:02',
].join('\n');

/** Reproduces NewTripForm's linked/unlinked mapping over the parsed items. */
function buildTripItems(items: ReturnType<typeof parseReceiptText>['items']) {
  const used = new Set<string>();
  const linked: { productId: string; name: string; unit: string; quantity: number; price: string }[] = [];
  const unlinked: { name: string; quantity: number; price: string }[] = [];

  for (const ri of items) {
    const hit = matchReceiptItem(ri.name, catalog);
    const quantity = ri.quantity > 0 ? ri.quantity : 1;
    const price = ri.unitPrice != null ? ri.unitPrice.toFixed(2) : '';
    if (hit && !used.has(hit.product.id)) {
      used.add(hit.product.id);
      linked.push({ productId: hit.product.id, name: hit.product.name, unit: hit.product.unit, quantity, price });
    } else if (!hit) {
      unlinked.push({ name: ri.name, quantity, price });
    }
  }
  return { linked, unlinked };
}

describe('scan pipeline (OCR text → trip items)', () => {
  const parsed = parseReceiptText(rawOcr);
  const { linked, unlinked } = buildTripItems(parsed.items);

  it('reads the header fields correctly', () => {
    expect(parsed.storeName).toBe('Walmart');
    expect(parsed.receiptDate).toBe('2025-12-28');
    expect(parsed.total).toBe(21.07);
  });

  it('auto-links the four catalog products with their receipt prices', () => {
    expect(linked.map((l) => l.productId).sort()).toEqual(['bread', 'eggs', 'milk', 'oj']);
    const byId = Object.fromEntries(linked.map((l) => [l.productId, l]));
    expect(byId.milk.price).toBe('2.78'); // UPC + tax flag stripped, price intact
    expect(byId.eggs.price).toBe('3.42');
    expect(byId.bread.price).toBe('2.50');
  });

  it('carries quantity × unit price through for "2 @ 3.00"', () => {
    const oj = linked.find((l) => l.productId === 'oj')!;
    expect(oj.quantity).toBe(2);
    expect(oj.price).toBe('3.00'); // unit price, not the 6.00 line total
  });

  it('keeps an unmatched product (Colgate Total) for the user to confirm', () => {
    const names = unlinked.map((u) => u.name.toLowerCase());
    expect(unlinked).toHaveLength(1);
    expect(names.some((n) => n.includes('colgate'))).toBe(true);
  });

  it('never turns fiscal/footer lines into items', () => {
    const all = [...linked, ...unlinked].map((i) => i.name.toLowerCase()).join(' ');
    expect(all).not.toMatch(/subtotal|\btax\b|debit|change|tend/);
  });
});
