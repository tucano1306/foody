import { describe, expect, it } from 'vitest';
import { applyOrder, moveInOrder } from './goal-order';

describe('moveInOrder', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('sube una posición', () => {
    expect(moveInOrder(ids, 'c', -1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('baja una posición', () => {
    expect(moveInOrder(ids, 'b', 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('se queda en el extremo en vez de dar la vuelta', () => {
    expect(moveInOrder(ids, 'a', -1)).toBe(ids);
    expect(moveInOrder(ids, 'd', 1)).toBe(ids);
  });

  it('devuelve la MISMA lista cuando no hay nada que mover', () => {
    // Identidad, no igualdad: quien la usa compara con === para no guardar
    // un orden que no cambió.
    expect(moveInOrder(ids, 'b', 0)).toBe(ids);
    expect(moveInOrder(ids, 'no-existe', 1)).toBe(ids);
  });

  it('acepta saltos de más de una posición sin salirse', () => {
    expect(moveInOrder(ids, 'a', 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveInOrder(ids, 'd', -99)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('no modifica la lista original', () => {
    const original = [...ids];
    moveInOrder(ids, 'a', 2);
    expect(ids).toEqual(original);
  });
});

describe('applyOrder', () => {
  const goals = [
    { id: 'a', name: 'Viaje' },
    { id: 'b', name: 'Deuda' },
    { id: 'c', name: 'Fondo' },
  ];
  const keyOf = (g: { id: string }) => g.id;

  it('ordena según la lista de ids', () => {
    expect(applyOrder(goals, ['c', 'a', 'b'], keyOf).map(keyOf)).toEqual(['c', 'a', 'b']);
  });

  it('manda al final lo que no está en el orden, conservando su posición', () => {
    // Una meta creada en otra pestaña todavía no está en el orden local: tiene
    // que aparecer igual, no desvanecerse.
    expect(applyOrder(goals, ['c'], keyOf).map(keyOf)).toEqual(['c', 'a', 'b']);
  });

  it('con el orden vacío deja todo como estaba', () => {
    expect(applyOrder(goals, [], keyOf).map(keyOf)).toEqual(['a', 'b', 'c']);
  });

  it('ignora ids que ya no existen', () => {
    expect(applyOrder(goals, ['borrada', 'b'], keyOf).map(keyOf)).toEqual(['b', 'a', 'c']);
  });

  it('no modifica el arreglo original', () => {
    const original = [...goals];
    applyOrder(goals, ['c', 'b', 'a'], keyOf);
    expect(goals).toEqual(original);
  });
});
