import { describe, it, expect } from 'vitest';
import { parseReceiptText } from './receipt-parser';

describe('parseReceiptText — US receipt', () => {
  const text = [
    'PUBLIX #1476',
    'JACKSONVILLE FL',
    'DATE 06/28/2026 14:32',
    'WHOLE MILK 1GL                3.98',
    'COCA COLA 2L        2 @ 2.49  4.98',
    'BREAD                         2.50',
    'SUBTOTAL                     11.46',
    'TAX                           0.80',
    'TOTAL                        12.26',
    'CASH                         20.00',
    'CHANGE                        7.74',
    'THANK YOU',
  ].join('\n');

  const r = parseReceiptText(text);

  it('detects the store, date and total', () => {
    expect(r.storeName).toBe('Publix');
    expect(r.receiptDate).toBe('2026-06-28');
    expect(r.total).toBe(12.26);
  });

  it('extracts product line items but not fiscal lines', () => {
    const names = r.items.map((i) => i.name);
    expect(names).toContain('WHOLE MILK 1GL');
    expect(names.some((n) => n.toLowerCase().includes('coca'))).toBe(true);
    expect(names.some((n) => /tax|subtotal|change|total|cash/i.test(n))).toBe(false);
  });

  it('reads quantity × unit price', () => {
    const coke = r.items.find((i) => i.name.toLowerCase().includes('coca'));
    expect(coke?.quantity).toBe(2);
    expect(coke?.unitPrice).toBe(2.49);
    expect(coke?.totalPrice).toBe(4.98);
  });
});

describe('parseReceiptText — Mexican (Spanish) receipt', () => {
  const text = [
    'SORIANA HIPER',
    'SUCURSAL 123',
    'FECHA 28/06/2026 14:32',
    'LECHE LALA 1L            24.50',
    'COCA COLA 2L     2 x 18.00   36.00',
    'PAN BIMBO                38.90',
    'SUBTOTAL                 99.40',
    'IVA                       0.00',
    'TOTAL A PAGAR            99.40',
    'EFECTIVO                100.00',
    'CAMBIO                    0.60',
    'GRACIAS POR SU COMPRA',
  ].join('\n');

  const r = parseReceiptText(text);

  it('detects store, day-first date and the "total a pagar"', () => {
    expect(r.storeName).toBe('Soriana');
    expect(r.receiptDate).toBe('2026-06-28');
    expect(r.total).toBe(99.4);
  });

  it('keeps only the three real products', () => {
    const names = r.items.map((i) => i.name.toLowerCase());
    expect(r.items).toHaveLength(3);
    expect(names.some((n) => n.includes('leche'))).toBe(true);
    expect(names.some((n) => n.includes('coca'))).toBe(true);
    expect(names.some((n) => n.includes('pan'))).toBe(true);
  });

  it('does not treat efectivo / cambio / iva as products', () => {
    const names = r.items.map((i) => i.name.toLowerCase()).join(' ');
    expect(names).not.toMatch(/efectivo|cambio|iva|subtotal/);
  });
});

describe('parseReceiptText — real US chain formats', () => {
  it('Walmart: strips UPC codes and tax-flag letters from names', () => {
    const r = parseReceiptText([
      'Walmart',
      'ST# 01234 OP# 009',
      'GV WHL MILK 007874201234 F 2.78 O',
      'GREAT VALUE EGGS 007874203912 N 3.42 O',
      'BREAD WHEAT 002890054321 2.50 X',
      'SUBTOTAL 8.70',
      'TOTAL 9.21',
      'CHANGE DUE 0.00',
      '12/28/2025 19:45:02',
    ].join('\n'));
    expect(r.storeName).toBe('Walmart');
    expect(r.total).toBe(9.21);
    expect(r.items.map((i) => i.name)).toEqual(['GV WHL MILK', 'GREAT VALUE EGGS', 'BREAD WHEAT']);
    expect(r.items.find((i) => i.name === 'GV WHL MILK')?.unitPrice).toBe(2.78);
  });

  it('Aldi: a tax-flag letter is not folded into the price', () => {
    const r = parseReceiptText(['ALDI', 'BANANAS 0.44 B', 'CHEDDAR 3.49 A', 'TOTAL 3.93'].join('\n'));
    expect(r.items.find((i) => i.name.toLowerCase() === 'bananas')?.unitPrice).toBe(0.44);
  });

  it('Publix: recovers a qty-first line "2 @ 3.00 ORANGE JUICE 6.00"', () => {
    const r = parseReceiptText([
      'Publix #1476',
      '2 @ 3.00 ORANGE JUICE 6.00',
      'Grand Total 6.00',
    ].join('\n'));
    const oj = r.items.find((i) => i.name.toLowerCase().includes('orange'));
    expect(oj).toBeDefined();
    expect(oj?.quantity).toBe(2);
    expect(oj?.unitPrice).toBe(3);
    expect(oj?.totalPrice).toBe(6);
  });

  it('CVS: a product named "...TOTAL" is not eaten as the receipt total', () => {
    const r = parseReceiptText([
      'CVS pharmacy',
      'COLGATE TOTAL 4.99 T',
      'ADVIL 200CT 12.49 T',
      'TOTAL 18.70',
    ].join('\n'));
    expect(r.total).toBe(18.7);
    expect(r.items.some((i) => i.name.toLowerCase().includes('colgate'))).toBe(true);
  });
});

describe('parseReceiptText — OCR-mangled fiscal labels', () => {
  it('"OTAL" (TOTAL with the T dropped by OCR) is the total, not a product', () => {
    const r = parseReceiptText([
      'WINN-DIXIE',
      'CUC MINT 8 OZ 10.99',
      'AVOCADO WHT 3.89',
      'OTAL 46.33',
    ].join('\n'));
    expect(r.total).toBe(46.33);
    expect(r.items.some((i) => /otal/i.test(i.name))).toBe(false);
    expect(r.items).toHaveLength(2);
  });

  it('"UBTOTAL" (SUBTOTAL with the S dropped) is not a product either', () => {
    const r = parseReceiptText([
      'MILK 1GL 3.98',
      'UBTOTAL 3.98',
      'TOTAL 4.26',
    ].join('\n'));
    expect(r.total).toBe(4.26);
    expect(r.items).toHaveLength(1);
  });
});

describe('parseReceiptText — thousands separators', () => {
  it('parses a total with a comma thousands separator', () => {
    const r = parseReceiptText(['MEMBERSHIP', 'TOTAL          1,299.00'].join('\n'));
    expect(r.total).toBe(1299);
  });

  it('parses a total with a dot thousands separator (European style)', () => {
    const r = parseReceiptText(['TOTAL          1.299,00'].join('\n'));
    expect(r.total).toBe(1299);
  });
});
