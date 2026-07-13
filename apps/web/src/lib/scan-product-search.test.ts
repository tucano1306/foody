import { describe, expect, it } from 'vitest';
import { rankProductsByScanText } from './scan-product-search';

interface P {
  id: string;
  name: string;
}
const p = (id: string, name: string): P => ({ id, name });

const CATALOG: readonly P[] = [
  p('1', 'Coca-Cola'),
  p('2', 'Coca-Cola Zero'),
  p('3', 'Leche'),
  p('4', 'Leche de Almendras'),
  p('5', 'Arroz'),
  p('6', 'Café'),
  p('7', 'Jabón Zote'),
  p('8', 'Papel Higiénico'),
];

describe('rankProductsByScanText', () => {
  it('ranks the more specific product first on a label with variant text', () => {
    const out = rankProductsByScanText('COCA-COLA\nZERO SUGAR\n355 mL', CATALOG);
    expect(out.map((c) => c.product.id)).toEqual(['2', '1']);
  });

  it('matches accented catalog names against accent-less OCR uppercase', () => {
    const out = rankProductsByScanText('CAFE TOSTADO Y MOLIDO 500 g', CATALOG);
    expect(out[0]?.product.id).toBe('6');
  });

  it('matches when OCR joins words together', () => {
    const out = rankProductsByScanText('CocaCola 600ml retornable', CATALOG);
    expect(out.map((c) => c.product.id)).toContain('1');
  });

  it('resolves a barcode-derived name to the plain catalog product', () => {
    const out = rankProductsByScanText('Leche entera Lala 1L', CATALOG);
    expect(out[0]?.product.id).toBe('3');
    // "Leche de Almendras" shares only 1 of 2 meaningful tokens — if present,
    // it must rank strictly below the exact match.
    const almendras = out.find((c) => c.product.id === '4');
    if (almendras) expect(almendras.score).toBeLessThan(out[0]!.score);
  });

  it('keeps a half-covered but distinctive name as a candidate', () => {
    // The bar of soap only prints "ZOTE" — half the catalog name, still a hit.
    const out = rankProductsByScanText('ZOTE 400g', CATALOG);
    expect(out.map((c) => c.product.id)).toContain('7');
  });

  it('returns nothing for empty or size-only text', () => {
    expect(rankProductsByScanText('', CATALOG)).toEqual([]);
    expect(rankProductsByScanText('600ml 2 1.5lt', CATALOG)).toEqual([]);
  });

  it('returns nothing when the text matches no product', () => {
    expect(rankProductsByScanText('Destornillador Phillips', CATALOG)).toEqual([]);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => p(`m${i}`, `Leche ${i}`));
    const out = rankProductsByScanText('Leche', [...CATALOG, ...many], 3);
    expect(out).toHaveLength(3);
  });

  it('scores whole-name containment above partial token coverage', () => {
    const out = rankProductsByScanText('JABON ZOTE BLANCO 400G', CATALOG);
    expect(out[0]?.product.id).toBe('7');
    expect(out[0]!.score).toBeGreaterThanOrEqual(0.9);
  });
});
