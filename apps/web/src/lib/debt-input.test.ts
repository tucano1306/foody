import { describe, expect, it } from 'vitest';
import { isValidationError, parseCreateDebt } from './debt-input';

/** Lo mínimo que acepta el validador: la estrategia por defecto pide plazo. */
const BASE = { name: 'Visa', balance: 1000, rate: 3, termMonths: 12 };

function parse(body: Record<string, unknown>) {
  const out = parseCreateDebt({ ...BASE, ...body });
  if (isValidationError(out)) throw new Error(`esperaba una deuda válida: ${out.error}`);
  return out;
}

/**
 * Lo que separa un importe de una tasa.
 *
 * En un importe, «54.587» es cincuenta y cuatro mil: el punto es de millares.
 * En una tasa, «1.500» es uno y medio por ciento — leerlo con la regla del
 * dinero convertiría un préstamo del 1,5 % en uno del 1500 %, que es la clase
 * de error que no se ve hasta que el plan de pagos ya está hecho.
 */
describe('parseCreateDebt — importes', () => {
  it('lee el saldo escrito en español', () => {
    expect(parse({ balance: '54.587,19' }).balance).toBe(54587.19);
  });

  it('lee el saldo escrito en inglés', () => {
    expect(parse({ balance: '54,587.19' }).balance).toBe(54587.19);
  });

  it('sigue aceptando un número ya hecho', () => {
    expect(parse({ balance: 54587.19 }).balance).toBe(54587.19);
  });
});

describe('parseCreateDebt — tasas', () => {
  it('acepta la coma decimal', () => {
    expect(parse({ rate: '1,5' }).rate).toBe(1.5);
  });

  it('NO convierte una tasa en millares', () => {
    // El caso que justifica tener dos lectores distintos.
    expect(parse({ rate: '1.500' }).rate).toBe(1.5);
    expect(parse({ rate: '1,500' }).rate).toBe(1.5);
  });

  it('lee tasas normales tal cual', () => {
    expect(parse({ rate: '36,75' }).rate).toBe(36.75);
    expect(parse({ rate: 3 }).rate).toBe(3);
    expect(parse({ rate: '0' }).rate).toBe(0);
  });
});

describe('parseCreateDebt — lo que rechaza', () => {
  it('un saldo que no es número', () => {
    const out = parseCreateDebt({ ...BASE, balance: 'abc' });
    expect(isValidationError(out)).toBe(true);
  });

  it('un saldo de cero o menos', () => {
    expect(isValidationError(parseCreateDebt({ ...BASE, balance: 0 }))).toBe(true);
  });

  it('una tasa negativa', () => {
    expect(isValidationError(parseCreateDebt({ ...BASE, rate: '-1' }))).toBe(true);
  });

  it('una tasa que no es número', () => {
    expect(isValidationError(parseCreateDebt({ ...BASE, rate: 'abc' }))).toBe(true);
  });
})
