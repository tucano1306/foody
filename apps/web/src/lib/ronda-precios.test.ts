import { describe, expect, it } from 'vitest';
import { pendientesDePrecio, siguienteSinPrecio } from './ronda-precios';

const l = (id: string, conPrecio: boolean) => ({ id, conPrecio });

describe('ronda de precios', () => {
  const lineas = [l('a', true), l('b', false), l('c', false), l('d', true), l('e', false)];

  it('pendientes en el orden del carrito', () => {
    expect(pendientesDePrecio(lineas)).toEqual(['b', 'c', 'e']);
  });

  it('el siguiente nunca es el que tienes abierto', () => {
    expect(siguienteSinPrecio(lineas, 'b')).toEqual({ id: 'c', restantes: 2 });
  });

  it('lo saltado en la ronda no vuelve a salir', () => {
    expect(siguienteSinPrecio(lineas, 'c', new Set(['b']))).toEqual({ id: 'e', restantes: 1 });
  });

  it('al ponerle precio al último, la ronda termina', () => {
    const conTodo = [l('a', true), l('b', true)];
    expect(siguienteSinPrecio(conTodo, 'b')).toEqual({ id: null, restantes: 0 });
  });

  it('abrir la ronda sin producto actual empieza por el primero', () => {
    expect(siguienteSinPrecio(lineas, null)).toEqual({ id: 'b', restantes: 3 });
  });
});
