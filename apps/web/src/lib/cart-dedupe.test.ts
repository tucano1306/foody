import { describe, expect, it } from 'vitest';
import { dedupeByProduct } from './cart-dedupe';

/**
 * El caso real: la lista tenia el jamon dos veces y el queso dos veces, asi que
 * el ticket de Publix salio con cinco lineas sumando $36.56 sobre un recibo de
 * $20.68. Sin duplicados: 8.99 + 6.89 + 4.80 = $20.68, exacto.
 */
const fila = (product_id: string, extra = '') => ({ product_id, id: `${product_id}${extra}` });

describe('dedupeByProduct', () => {
  it('el ticket de Publix: cinco filas, tres productos', () => {
    const lista = [fila('jamon', 'a'), fila('jamon', 'b'), fila('queso', 'a'), fila('tomate'), fila('queso', 'b')];
    expect(dedupeByProduct(lista).map((r) => r.product_id)).toEqual(['jamon', 'queso', 'tomate']);
  });

  it('se queda con la PRIMERA, que es la mas antigua de la lista', () => {
    expect(dedupeByProduct([fila('jamon', 'a'), fila('jamon', 'b')])[0].id).toBe('jamona');
  });

  it('sin duplicados no toca nada ni cambia el orden', () => {
    const lista = [fila('c'), fila('a'), fila('b')];
    expect(dedupeByProduct(lista)).toEqual(lista);
  });

  it('una lista vacia sigue vacia', () => {
    expect(dedupeByProduct([])).toEqual([]);
  });

  it('cuatro filas del mismo producto son una', () => {
    // Es lo que habia vivo en la lista: «Queso Azul» con cuatro filas, que en
    // la siguiente compra habria metido cuatro lineas identicas.
    const lista = ['a', 'b', 'c', 'd'].map((x) => fila('queso-azul', x));
    expect(dedupeByProduct(lista)).toHaveLength(1);
  });
});
