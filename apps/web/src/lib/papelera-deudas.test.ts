import { describe, expect, it } from 'vitest';
import { agruparPapelera, cuandoSeBorro, type DeudaEnPapelera } from './papelera-deudas';

const VIERNES = '2026-11-07T21:40:00.000Z';
const LUNES = '2026-11-02T15:00:00.000Z';

function fila(over: Partial<DeudaEnPapelera>): DeudaEnPapelera {
  return {
    id: 'x',
    name: 'Deuda',
    kind: 'credit_card',
    issuer: null,
    accountLast4: null,
    cardGroup: null,
    balance: 0,
    currency: 'USD',
    deletedAt: VIERNES,
    ...over,
  };
}

describe('agruparPapelera', () => {
  it('una tarjeta borrada entera es UNA entrada, con el nombre de la tarjeta y la suma de sus tramos', () => {
    const entradas = agruparPapelera([
      fila({ id: 'a', name: 'Compras 3650', issuer: 'Bank of America', cardGroup: 'g', balance: 5200.5 }),
      fila({ id: 'b', name: 'Unlimited Cash 3650', issuer: 'Bank of America', cardGroup: 'g', balance: 7000.25 }),
      fila({ id: 'c', name: 'Saldo nuevo 3650', issuer: 'Bank of America', cardGroup: 'g', balance: 1079.27 }),
    ]);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      id: 'a',
      ids: ['a', 'b', 'c'],
      titulo: 'Bank of America ···3650',
      ultimos: '3650',
      tramos: 3,
      saldo: 13280.02,
    });
  });

  it('tramos de la misma tarjeta borrados en días distintos son entradas distintas', () => {
    // Es la regla de `restaurarDeLaPapelera`: lo que se ve junto, vuelve junto.
    const entradas = agruparPapelera([
      fila({ id: 'b', name: 'Unlimited Cash 3650', cardGroup: 'g', deletedAt: VIERNES }),
      fila({ id: 'c', name: 'Saldo nuevo 3650', cardGroup: 'g', deletedAt: VIERNES }),
      fila({ id: 'a', name: 'Compras 3650', cardGroup: 'g', deletedAt: LUNES }),
    ]);
    expect(entradas.map((e) => e.ids)).toEqual([['b', 'c'], ['a']]);
  });

  it('un tramo suelto se llama por su nombre, no por el de la tarjeta', () => {
    const [e] = agruparPapelera([
      fila({ id: 'a', name: 'Compras 3650', issuer: 'Bank of America', cardGroup: 'g' }),
    ]);
    expect(e.titulo).toBe('Compras 3650');
    expect(e.tramos).toBe(1);
  });

  it('las deudas sueltas no se juntan aunque se borren a la vez', () => {
    const entradas = agruparPapelera([
      fila({ id: 'auto', name: 'Auto GMC', kind: 'auto' }),
      fila({ id: '8523', name: 'Cash Rewards 8523', accountLast4: '8523' }),
    ]);
    expect(entradas.map((e) => e.titulo)).toEqual(['Auto GMC', 'Cash Rewards 8523']);
    expect(entradas[0].kind).toBe('auto');
    expect(entradas[1].ultimos).toBe('8523');
  });

  it('respeta el orden del servidor (lo más reciente primero)', () => {
    const entradas = agruparPapelera([
      fila({ id: 'nueva', name: 'Nueva', deletedAt: VIERNES }),
      fila({ id: 'vieja', name: 'Vieja', deletedAt: LUNES }),
    ]);
    expect(entradas.map((e) => e.id)).toEqual(['nueva', 'vieja']);
  });

  it('sin nada en la papelera, nada que enseñar', () => {
    expect(agruparPapelera([])).toEqual([]);
  });
});

describe('cuandoSeBorro', () => {
  const ahora = new Date(2026, 10, 7, 18, 0); // 7 nov, 18:00 locales

  it('cuenta días de calendario, no bloques de 24 horas', () => {
    expect(cuandoSeBorro(new Date(2026, 10, 7, 9, 0).toISOString(), ahora)).toBe('hoy');
    expect(cuandoSeBorro(new Date(2026, 10, 6, 23, 0).toISOString(), new Date(2026, 10, 7, 8, 0))).toBe('ayer');
    expect(cuandoSeBorro(new Date(2026, 10, 3, 12, 0).toISOString(), ahora)).toBe('hace 4 días');
  });

  it('pasada una semana, dice la fecha', () => {
    expect(cuandoSeBorro(new Date(2026, 9, 3, 12, 0).toISOString(), ahora)).toMatch(/^el 3 oct/);
  });

  it('sin fecha (o con una rota) no dice nada', () => {
    expect(cuandoSeBorro(null, ahora)).toBeNull();
    expect(cuandoSeBorro('no es fecha', ahora)).toBeNull();
  });
});
