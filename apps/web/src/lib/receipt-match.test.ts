import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  meaningfulTokens,
  matchReceiptItem,
  type MatchableProduct,
} from './receipt-match';

const catalog: MatchableProduct[] = [
  { id: 'milk', name: 'Leche' },
  { id: 'coke', name: 'Coca-Cola' },
  { id: 'eggs', name: 'Huevo San Juan' },
  { id: 'bread', name: 'Pan Bimbo' },
  { id: 'apple', name: 'Manzana' },
];

describe('normalizeName', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeName('Coca-Cola')).toBe('coca cola');
    expect(normalizeName('JABÓN ZOTE')).toBe('jabon zote');
  });
});

describe('meaningfulTokens', () => {
  it('drops size/quantity and stop-word tokens', () => {
    expect(meaningfulTokens('LECHE LALA 1L')).toEqual(['leche', 'lala']);
    expect(meaningfulTokens('COCA COLA 2L')).toEqual(['coca', 'cola']);
    expect(meaningfulTokens('Pan de caja 680g')).toEqual(['pan', 'caja']);
  });
});

describe('matchReceiptItem', () => {
  it('links a noisy receipt name to a catalog product', () => {
    expect(matchReceiptItem('LECHE LALA 1L', catalog)?.product.id).toBe('milk');
    expect(matchReceiptItem('COCA COLA 2L', catalog)?.product.id).toBe('coke');
    expect(matchReceiptItem('HUEVO SAN JUAN 18PZ', catalog)?.product.id).toBe('eggs');
  });

  it('matches when the catalog name is fully contained in the receipt name', () => {
    expect(matchReceiptItem('PAN BIMBO BLANCO GRANDE', catalog)?.product.id).toBe('bread');
  });

  it('is case- and accent-insensitive', () => {
    expect(matchReceiptItem('manzana roja', catalog)?.product.id).toBe('apple');
  });

  it('returns null when nothing is similar enough', () => {
    expect(matchReceiptItem('DETERGENTE ARIEL', catalog)).toBeNull();
    expect(matchReceiptItem('XYZ 123', catalog)).toBeNull();
  });

  it('returns null for an empty / numeric-only name', () => {
    expect(matchReceiptItem('   ', catalog)).toBeNull();
    expect(matchReceiptItem('500g', catalog)).toBeNull();
  });

  it('does not match on a shared size/stop-word token alone', () => {
    // "1L" and "de" must not bridge unrelated products.
    const products: MatchableProduct[] = [{ id: 'x', name: 'Aceite de oliva 1L' }];
    expect(matchReceiptItem('SHAMPOO 1L', products)).toBeNull();
  });
});
