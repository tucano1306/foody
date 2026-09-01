import { describe, it, expect } from 'vitest';
import {
  brandKey,
  normalizeBrand,
  sameBrand,
  suggestBrands,
  summarizeBrands,
  type BrandPurchase,
} from './product-brands';

function buy(over: Partial<BrandPurchase> = {}): BrandPurchase {
  return { brand: 'Kraft', unitPrice: 4.99, purchasedAt: '2026-08-01T12:00:00Z', storeName: 'Publix', ...over };
}

describe('normalizeBrand', () => {
  it('recorta y colapsa espacios', () => {
    expect(normalizeBrand('  Kraft  ')).toBe('Kraft');
    expect(normalizeBrand('Great   Value')).toBe('Great Value');
  });

  it('«sin marca» es null, nunca cadena vacía', () => {
    // Una cadena vacía en la base se agruparía como si fuera una marca más.
    expect(normalizeBrand('')).toBeNull();
    expect(normalizeBrand('   ')).toBeNull();
    expect(normalizeBrand(null)).toBeNull();
    expect(normalizeBrand(undefined)).toBeNull();
    expect(normalizeBrand(42)).toBeNull();
  });

  it('acota la longitud', () => {
    expect(normalizeBrand('x'.repeat(200))).toHaveLength(60);
  });
});

describe('sameBrand / brandKey', () => {
  it('la misma marca escrita distinto es la misma marca', () => {
    expect(sameBrand('Kraft', 'kraft')).toBe(true);
    expect(sameBrand('Nestlé', 'nestle')).toBe(true);
  });

  it('marcas distintas no se confunden', () => {
    expect(sameBrand('Kraft', 'Publix')).toBe(false);
  });

  it('sin marca solo coincide con sin marca', () => {
    expect(sameBrand(null, null)).toBe(true);
    expect(sameBrand(null, 'Kraft')).toBe(false);
    expect(sameBrand('Kraft', null)).toBe(false);
  });

  it('la clave ignora mayúsculas y acentos', () => {
    expect(brandKey('Nestlé')).toBe(brandKey('NESTLE'));
  });
});

describe('summarizeBrands — el caso del queso parmesano', () => {
  // Tres compras del MISMO artículo de despensa, dos marcas distintas.
  const parmesano: BrandPurchase[] = [
    buy({ brand: 'Kraft', unitPrice: 4.99, purchasedAt: '2026-06-01T12:00:00Z', storeName: 'Publix' }),
    buy({ brand: 'kraft', unitPrice: 5.49, purchasedAt: '2026-07-01T12:00:00Z', storeName: 'Walmart' }),
    buy({ brand: 'Publix', unitPrice: 3.79, purchasedAt: '2026-08-01T12:00:00Z', storeName: 'Publix' }),
  ];

  it('agrupa por marca aunque se escriba distinto', () => {
    const r = summarizeBrands(parmesano);
    expect(r).toHaveLength(2);
    const kraft = r.find((b) => brandKey(b.label) === 'kraft')!;
    expect(kraft.purchases).toBe(2);
  });

  it('ordena por la más barata: la pregunta es cuál conviene', () => {
    const r = summarizeBrands(parmesano);
    expect(r[0].label).toBe('Publix');
    expect(r[0].minPrice).toBe(3.79);
  });

  it('dice dónde salió más barata cada marca', () => {
    const kraft = summarizeBrands(parmesano).find((b) => brandKey(b.label) === 'kraft')!;
    expect(kraft.minPrice).toBe(4.99);
    expect(kraft.cheapestStore).toBe('Publix');
    expect(kraft.avgPrice).toBe(5.24);
  });

  it('usa la grafía más reciente como etiqueta', () => {
    // Escrita «Kraft» en junio y «kraft» en julio: manda la de julio.
    const kraft = summarizeBrands(parmesano).find((b) => brandKey(b.label) === 'kraft')!;
    expect(kraft.label).toBe('kraft');
  });

  it('las compras sin marca son su propio grupo, y van al final', () => {
    const r = summarizeBrands([...parmesano, buy({ brand: null, unitPrice: null })]);
    expect(r).toHaveLength(3);
    expect(r[r.length - 1].label).toBe('Sin marca');
    expect(r[r.length - 1].minPrice).toBeNull();
  });

  it('ignora precios que no sirven para comparar', () => {
    const r = summarizeBrands([
      buy({ brand: 'X', unitPrice: null }),
      buy({ brand: 'X', unitPrice: 0 }),
      buy({ brand: 'X', unitPrice: 2.5 }),
    ]);
    expect(r[0].minPrice).toBe(2.5);
    expect(r[0].avgPrice).toBe(2.5);
    expect(r[0].purchases).toBe(3);
  });

  it('sin compras no inventa grupos', () => {
    expect(summarizeBrands([])).toEqual([]);
  });
});

describe('suggestBrands', () => {
  it('ofrece las más compradas primero', () => {
    const s = suggestBrands([
      buy({ brand: 'Kraft', purchasedAt: '2026-06-01T12:00:00Z' }),
      buy({ brand: 'Kraft', purchasedAt: '2026-07-01T12:00:00Z' }),
      buy({ brand: 'Publix', purchasedAt: '2026-08-01T12:00:00Z' }),
    ]);
    expect(s).toEqual(['Kraft', 'Publix']);
  });

  it('no repite la misma marca escrita distinto', () => {
    const s = suggestBrands([buy({ brand: 'Kraft' }), buy({ brand: 'kraft' })]);
    expect(s).toHaveLength(1);
  });

  it('las compras sin marca no son un atajo', () => {
    expect(suggestBrands([buy({ brand: null })])).toEqual([]);
  });

  it('se queda en unos pocos: son atajos, no un catálogo', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((b) => buy({ brand: b }));
    expect(suggestBrands(many)).toHaveLength(4);
    expect(suggestBrands(many, 2)).toHaveLength(2);
  });
});
