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

  /**
   * El total del super se escribia en un `type="number"`, que no deja teclear
   * coma, y se leia con `parseFloat`, que la corta: «87,50» valia 87 y los
   * cincuenta centavos desaparecian sin avisar. Ahora lo lee `parseMoney`, el
   * mismo que el resto de la app.
   */
  it('entiende la coma decimal, no se come los centavos', () => {
    expect(resumenDeCompra(3, '87,50')).toBe('3 artículos · $87.50');
    expect(resumenDeCompra(3, '87.50')).toBe('3 artículos · $87.50');
  });

  it('entiende los separadores de millares', () => {
    expect(resumenDeCompra(40, '1.234,56')).toBe('40 artículos · $1234.56');
    expect(resumenDeCompra(40, '1,234.56')).toBe('40 artículos · $1234.56');
  });
})
