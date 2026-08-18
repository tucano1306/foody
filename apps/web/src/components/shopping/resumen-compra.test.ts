import { describe, expect, it } from 'vitest';
import { resumenDeCompra } from './SupermarketView';

/** El dato que se luce al terminar la compra. */
describe('resumenDeCompra', () => {
  it('junta artículos y total', () => {
    expect(resumenDeCompra(12, '48.2')).toBe('12 artículos · $48.20');
  });

  it('dice «artículo» en singular', () => {
    expect(resumenDeCompra(1, '3.5')).toBe('1 artículo · $3.50');
  });

  it('sin total escrito dice solo lo que sí se sabe', () => {
    // Inventar «$0.00» sería mentir sobre lo que costó la compra.
    expect(resumenDeCompra(7, '')).toBe('7 artículos');
    expect(resumenDeCompra(7, '   ')).toBe('7 artículos');
    expect(resumenDeCompra(7, 'abc')).toBe('7 artículos');
    expect(resumenDeCompra(7, '0')).toBe('7 artículos');
  });
})
