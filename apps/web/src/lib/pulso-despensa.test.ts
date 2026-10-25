import { describe, expect, it } from 'vitest';
import type { StockLevel } from '@foody/types';
import { pulsoDeDespensa } from './pulso-despensa';

const p = (id: string, stockLevel: StockLevel) => ({ id, stockLevel });

describe('pulsoDeDespensa', () => {
  it('reparte por nivel y suma lo que falta', () => {
    const r = pulsoDeDespensa(
      [p('a', 'full'), p('b', 'full'), p('c', 'half'), p('d', 'empty'), p('e', 'empty')],
      new Set(),
    );
    expect(r).toEqual({ tengo: 2, mitad: 1, acabado: 2, enCarrito: 0, porReponer: 3, total: 5 });
  });

  it('lo que va en el carrito deja de contar como por reponer', () => {
    const r = pulsoDeDespensa(
      [p('a', 'half'), p('b', 'empty'), p('c', 'empty')],
      new Set(['b', 'a']),
    );
    expect(r.enCarrito).toBe(2);
    expect(r.mitad).toBe(0);
    expect(r.acabado).toBe(1);
    expect(r.porReponer).toBe(1);
  });

  it('un lleno en el carrito sigue siendo «tengo»', () => {
    // La lista de la compra no debería tener llenos, pero si una fila vieja lo
    // trae, el producto no puede aparecer como faltante.
    const r = pulsoDeDespensa([p('a', 'full')], new Set(['a']));
    expect(r).toMatchObject({ tengo: 1, enCarrito: 0, porReponer: 0 });
  });

  it('ids del carrito que no están en la despensa no cuentan', () => {
    const r = pulsoDeDespensa([p('a', 'empty')], new Set(['zz']));
    expect(r).toMatchObject({ acabado: 1, enCarrito: 0, total: 1 });
  });

  it('despensa vacía', () => {
    expect(pulsoDeDespensa([], new Set())).toEqual({
      tengo: 0, mitad: 0, acabado: 0, enCarrito: 0, porReponer: 0, total: 0,
    });
  });
});
