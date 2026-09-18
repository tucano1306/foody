import { describe, expect, it } from 'vitest';
import { findDuplicate, productKey } from './product-dedupe';

const CATALOGO = [
  { id: 'agua', name: 'Agua' },
  { id: 'atun', name: 'Atun' },
  { id: 'queso-fresco', name: 'Queso Fresco' },
  { id: 'queso-parmesano', name: 'Queso Parmesano' },
  { id: 'sal', name: 'sal' },
  { id: 'aceite', name: 'Aceite De Oliva' },
];

describe('productKey', () => {
  it('ignora mayúsculas, acentos y espacios de más', () => {
    expect(productKey('Atún')).toBe(productKey('atun'));
    expect(productKey('  SAL  ')).toBe(productKey('sal'));
    expect(productKey('Aceite  De   Oliva')).toBe(productKey('aceite de oliva'));
  });
});

describe('findDuplicate', () => {
  it('reconoce el producto que ya está, se escriba como se escriba', () => {
    expect(findDuplicate('ATÚN', CATALOGO)?.id).toBe('atun');
    expect(findDuplicate('  sal ', CATALOGO)?.id).toBe('sal');
    expect(findDuplicate('aceite de oliva', CATALOGO)?.id).toBe('aceite');
  });

  it('deja pasar lo que de verdad es nuevo', () => {
    expect(findDuplicate('Cambur', CATALOGO)).toBeNull();
    // Dos quesos distintos siguen siendo dos productos.
    expect(findDuplicate('Queso Azul', CATALOGO)).toBeNull();
    expect(findDuplicate('Queso Parmesano', CATALOGO)?.id).toBe('queso-parmesano');
  });

  it('no traduce: crear «Water» teniendo «Agua» son dos productos', () => {
    // A propósito. El emparejador de recibos sí traduce, pero el catálogo es
    // del usuario: si escribe los dos nombres, es que quiere los dos.
    expect(findDuplicate('Water', CATALOGO)).toBeNull();
  });

  it('un nombre que no deja nada al normalizar no casa con nada', () => {
    // Sin esta guarda, la primera ficha del catálogo se tragaría la creación.
    expect(findDuplicate('', CATALOGO)).toBeNull();
    expect(findDuplicate('   ', CATALOGO)).toBeNull();
    expect(findDuplicate('¿!¿!', CATALOGO)).toBeNull();
  });

  it('con el catálogo vacío nunca hay duplicado', () => {
    expect(findDuplicate('Agua', [])).toBeNull();
  });
});
