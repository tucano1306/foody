import { describe, expect, it } from 'vitest';
import { isPartialMoney, parseDecimal, parseMoney, parseSignedMoney } from './money-input';

/**
 * El caso que destapó todo: un sueldo anual de 54.587,19 se guardó como 54,587
 * y el plan anunció que se ganaban 5 dólares al mes (54,587 / 12 = 4,55).
 */
describe('parseMoney — el sueldo de 54.587,19', () => {
  it('lee el importe escrito en español', () => {
    expect(parseMoney('54.587,19')).toBe(54587.19);
  });

  it('lee el mismo importe escrito en inglés', () => {
    expect(parseMoney('54,587.19')).toBe(54587.19);
  });

  it('y dividido entre 12 da un sueldo mensual creíble', () => {
    const anual = parseMoney('54.587,19');
    expect(anual! / 12).toBeCloseTo(4548.93, 2);
  });
});

describe('parseMoney — los dos separadores', () => {
  it('el último manda, sea cual sea', () => {
    expect(parseMoney('1.234.567,89')).toBe(1234567.89);
    expect(parseMoney('1,234,567.89')).toBe(1234567.89);
  });
});

describe('parseMoney — un solo separador', () => {
  it('repetido es de millares', () => {
    expect(parseMoney('1.234.567')).toBe(1234567);
    expect(parseMoney('1,234,567')).toBe(1234567);
  });

  it('con TRES cifras detrás es de millares', () => {
    expect(parseMoney('54.587')).toBe(54587);
    expect(parseMoney('1,500')).toBe(1500);
    expect(parseMoney('999.999')).toBe(999999);
  });

  it('con una o dos cifras detrás es decimal', () => {
    expect(parseMoney('54,5')).toBe(54.5);
    expect(parseMoney('2,50')).toBe(2.5);
    expect(parseMoney('2.50')).toBe(2.5);
    expect(parseMoney('0,99')).toBe(0.99);
  });

  it('con más de tres cifras detrás es decimal, y se redondea a céntimos', () => {
    expect(parseMoney('1,23456')).toBe(1.23);
  });
});

describe('parseMoney — lo que la gente pega o teclea de más', () => {
  it('ignora símbolos de moneda y espacios', () => {
    expect(parseMoney('$54.587,19')).toBe(54587.19);
    expect(parseMoney('  1 234,56  ')).toBe(1234.56);
    expect(parseMoney('54 587')).toBe(54587);
  });

  it('acepta números sin separador', () => {
    expect(parseMoney('54587')).toBe(54587);
    expect(parseMoney('0')).toBe(0);
  });

  it('acepta un número ya hecho', () => {
    expect(parseMoney(54587.19)).toBe(54587.19);
    expect(parseMoney(4548.926)).toBe(4548.93);
  });
});

describe('parseMoney — lo que NO es un importe', () => {
  it('devuelve null, nunca 0', () => {
    // Un 0 silencioso se confunde con un importe real y se cuela en las cuentas.
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('$')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney(Number.NaN)).toBeNull();
  });

  it('rechaza negativos', () => {
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney(-5)).toBeNull();
  });

  it('rechaza un menos colocado en medio', () => {
    expect(parseMoney('5-5')).toBeNull();
  });

  it('rechaza importes absurdos', () => {
    expect(parseMoney('999999999999')).toBeNull();
  });
});

describe('isPartialMoney', () => {
  it('deja escribir sin pelearse a mitad de camino', () => {
    expect(isPartialMoney('')).toBe(true);
    expect(isPartialMoney('54')).toBe(true);
    expect(isPartialMoney('54,')).toBe(true);
    expect(isPartialMoney('54,1')).toBe(true);
  });
})

describe('parseSignedMoney', () => {
  it('acepta negativos, que en un aporte significan «me pasé, resta»', () => {
    expect(parseSignedMoney('-50')).toBe(-50);
    expect(parseSignedMoney('-1.234,56')).toBe(-1234.56);
    expect(parseSignedMoney(-50)).toBe(-50);
  });

  it('lee los positivos igual que parseMoney', () => {
    expect(parseSignedMoney('54.587,19')).toBe(54587.19);
  });

  it('sigue rechazando lo que no es un importe', () => {
    expect(parseSignedMoney('')).toBeNull();
    expect(parseSignedMoney('abc')).toBeNull();
    expect(parseSignedMoney('-')).toBeNull();
  });

  it('respeta el tope en los dos sentidos', () => {
    expect(parseSignedMoney('-999999999999')).toBeNull();
  });
});

/**
 * Tasas y cantidades. La diferencia con el dinero es una sola regla, y es la
 * que evita convertir un préstamo del 1,5 % en uno del 1500 %.
 */
describe('parseDecimal', () => {
  it('acepta la coma decimal, que es de lo que va todo esto', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('36,75')).toBe(36.75);
  });

  it('un separador suelto es SIEMPRE decimal, aunque le sigan tres cifras', () => {
    // La diferencia con parseMoney: aquí «1.500» es uno y medio.
    expect(parseDecimal('1.500')).toBe(1.5);
    expect(parseDecimal('1,500')).toBe(1.5);
    expect(parseMoney('1.500')).toBe(1500); // el dinero sí lo lee como millares
  });

  it('con los dos separadores, el último sigue siendo el decimal', () => {
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
  });

  it('sirve para cantidades con decimales', () => {
    expect(parseDecimal('2,18')).toBe(2.18);
    expect(parseDecimal('0,5')).toBe(0.5);
  });

  it('no redondea a céntimos: una tasa puede tener más decimales', () => {
    expect(parseDecimal('3,456')).toBe(3.456);
  });

  it('rechaza lo que no es un número', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1.5.0')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });

  it('acepta el cero, que en un extra mensual significa «ninguno»', () => {
    expect(parseDecimal('0')).toBe(0);
  });
});
