import { describe, expect, it } from 'vitest';
import type { ShoppingListItem } from '@foody/types';
import { cartSummary } from './SupermarketView';

/**
 * El carrito sumado: el número que se mira cada dos minutos en la tienda y el
 * que decide si la compra se cierra con $20.68 o con un $0.00 que no es verdad.
 */
function producto(
  id: string,
  { cantidad = 1, ultimo = null as number | null }: { cantidad?: number; ultimo?: number | null } = {},
): ShoppingListItem {
  return {
    id: `li-${id}`,
    productId: id,
    quantityNeeded: cantidad,
    isInCart: true,
    isPurchased: false,
    userId: 'u1',
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    product: {
      id,
      name: id,
      unit: 'unid.',
      category: null,
      photoUrl: null,
      lastPurchasePrice: ultimo,
    },
  } as unknown as ShoppingListItem;
}

describe('cartSummary', () => {
  it('suma cada lote por su cantidad y cuenta los que ya llevan precio', () => {
    const { lines, total, pricedCount, estimatedCount } = cartSummary(
      [producto('queso'), producto('jamon')],
      { queso: [{ qty: 2, total: 3.5 }], jamon: [{ qty: 1, total: 1.25 }] },
    );

    expect(total).toBeCloseTo(8.25, 2);
    expect(pricedCount).toBe(2);
    expect(estimatedCount).toBe(0);
    expect(lines.map((l) => l.item.productId)).toEqual(['queso', 'jamon']);
    expect(lines[0]).toMatchObject({ qty: 2, lineTotal: 7, estimated: false });
  });

  /** Los tomates de la foto: 2.41 lb a $1.99 la libra son $4.80, no $1.99. */
  it('lo que se vende por peso son libras × precio por libra', () => {
    const { total, pricedCount } = cartSummary([producto('tomates')], {
      tomates: [{ qty: 2.41, total: null, mode: 'lb' as const, unitPrice: 1.99 }],
    });

    expect(total).toBeCloseTo(4.8, 2);
    expect(pricedCount).toBe(1);
  });

  it('junta los varios lotes de un mismo producto', () => {
    // Dos bandejas de carne con su etiqueta cada una: un producto, dos precios.
    const { lines, total } = cartSummary([producto('carne')], {
      carne: [{ qty: 1, total: 6.4 }, { qty: 2, total: 3.1 }],
    });

    expect(total).toBeCloseTo(12.6, 2);
    expect(lines[0].qty).toBe(3);
  });

  it('sin precio de hoy tira del último y lo marca como estimado', () => {
    const { lines, total, pricedCount, estimatedCount } = cartSummary(
      [producto('leche', { cantidad: 3, ultimo: 2 })],
      {},
    );

    expect(total).toBeCloseTo(6, 2);
    expect(pricedCount).toBe(0);
    expect(estimatedCount).toBe(1);
    expect(lines[0].estimated).toBe(true);
  });

  it('sin precio de hoy ni de antes no se inventa un importe', () => {
    const { lines, total, pricedCount, estimatedCount } = cartSummary([producto('pan')], {});

    expect(total).toBe(0);
    expect(pricedCount).toBe(0);
    expect(estimatedCount).toBe(0);
    expect(lines[0]).toMatchObject({ qty: 1, lineTotal: 0, estimated: false });
  });

  it('sin lotes, la cantidad es la que hacía falta (y nunca menos de una)', () => {
    const { lines } = cartSummary([producto('arroz', { cantidad: 4 }), producto('sal', { cantidad: 0 })], {});

    expect(lines.map((l) => l.qty)).toEqual([4, 1]);
  });

  it('un carrito vacío suma cero', () => {
    expect(cartSummary([], {})).toEqual({ lines: [], total: 0, pricedCount: 0, estimatedCount: 0 });
  });
});
