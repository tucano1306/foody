import { describe, expect, it } from 'vitest';
import { precioSeConserva, resolverPreciosDeCompra } from './precios-compra';

/**
 * «Cuando le doy finalizar compra veo productos con precios iguales y
 * diferentes a los que les puse.» El Walmart del 21 oct 2026 ($111.69)
 * terminó con veinte productos a $2.25: los precios tecleados en el súper se
 * guardaban con el mismo origen que los estimados, y al editar el ticket se
 * repartió el total entre las unidades.
 */
describe('resolverPreciosDeCompra', () => {
  it('lo tecleado en el súper manda, y queda como manual', () => {
    const r = resolverPreciosDeCompra({
      lineas: [{ productId: 'cafe', quantity: 1 }],
      tecleados: { cafe: 8.97 },
      ultimos: { cafe: 7.5 },
      totalTicket: 8.97,
    });
    expect(r.cafe).toEqual({ unitPrice: 8.97, source: 'manual' });
  });

  it('sin precio tecleado, el de la última compra, marcado como tal', () => {
    const r = resolverPreciosDeCompra({
      lineas: [{ productId: 'vinagre', quantity: 1 }],
      tecleados: {},
      ultimos: { vinagre: 1.48 },
      totalTicket: null,
    });
    expect(r.vinagre).toEqual({ unitPrice: 1.48, source: 'last_price' });
  });

  it('solo lo que no tiene ningún precio se lleva el resto del total, por unidades', () => {
    const r = resolverPreciosDeCompra({
      lineas: [
        { productId: 'cafe', quantity: 1 },
        { productId: 'limones', quantity: 4 },
        { productId: 'adobo', quantity: 1 },
      ],
      tecleados: { cafe: 10 },
      ultimos: {},
      totalTicket: 20,
    });
    expect(r.cafe).toEqual({ unitPrice: 10, source: 'manual' });
    // Quedan $10 para 5 unidades sin precio.
    expect(r.limones).toEqual({ unitPrice: 2, source: 'allocated' });
    expect(r.adobo).toEqual({ unitPrice: 2, source: 'allocated' });
  });

  it('sin total no se reparte nada: no se inventa un precio', () => {
    const r = resolverPreciosDeCompra({ lineas: [{ productId: 'x', quantity: 2 }], tecleados: {}, ultimos: {}, totalTicket: null });
    expect(r.x).toEqual({ unitPrice: null, source: 'unknown' });
  });

  it('si lo tecleado ya cubre el total, lo demás se queda sin precio en vez de a $0', () => {
    const r = resolverPreciosDeCompra({
      lineas: [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }],
      tecleados: { a: 30 },
      ultimos: {},
      totalTicket: 25,
    });
    expect(r.b).toEqual({ unitPrice: null, source: 'unknown' });
  });

  it('lo tecleado que no es un número positivo no cuenta', () => {
    for (const malo of [0, -3, Number.NaN, '4.99', null]) {
      const r = resolverPreciosDeCompra({ lineas: [{ productId: 'a', quantity: 1 }], tecleados: { a: malo }, ultimos: { a: 2 }, totalTicket: null });
      expect(r.a.source).toBe('last_price');
    }
  });
});

describe('precioSeConserva', () => {
  it('una edición conserva todo menos lo repartido', () => {
    expect(precioSeConserva('manual')).toBe(true);
    expect(precioSeConserva('last_price')).toBe(true);
    // Tickets del súper de antes de distinguir el origen: ahí iban los tecleados.
    expect(precioSeConserva('shopping_list')).toBe(true);
    expect(precioSeConserva('allocated')).toBe(false);
    expect(precioSeConserva('unknown')).toBe(false);
    expect(precioSeConserva(null)).toBe(false);
  });
});
