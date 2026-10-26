import { describe, expect, it } from 'vitest';
import { degradadoDeTienda, inicialesDeTienda } from './StoreMark';

describe('StoreMark', () => {
  it('una palabra da una inicial; dos o más, dos', () => {
    expect(inicialesDeTienda('Walmart')).toBe('W');
    expect(inicialesDeTienda("Sam's Club")).toBe('SC');
    expect(inicialesDeTienda('el super de la esquina')).toBe('ES');
  });

  it('ignora signos sueltos y respeta acentos', () => {
    expect(inicialesDeTienda('  - Ñandú  ')).toBe('Ñ');
    expect(inicialesDeTienda('7 Eleven')).toBe('7E');
  });

  it('sin nombre, un interrogante', () => {
    expect(inicialesDeTienda(null)).toBe('?');
    expect(inicialesDeTienda('   ')).toBe('?');
  });

  it('la misma tienda tiene siempre el mismo color', () => {
    expect(degradadoDeTienda('Publix')).toEqual(degradadoDeTienda('  publix '));
  });
});
