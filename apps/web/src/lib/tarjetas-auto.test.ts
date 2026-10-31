import { describe, expect, it } from 'vitest';
import { agrupacionesAutomaticas, bancoNormalizado, type DeudaParaAgrupar } from './tarjetas-auto';

function d(over: Partial<DeudaParaAgrupar> & { id: string }): DeudaParaAgrupar {
  return {
    kind: 'credit_card',
    status: 'active',
    issuer: 'Bank of America',
    accountLast4: '3650',
    cardGroup: null,
    cardGroupManual: false,
    currentBalance: 100,
    ...over,
  };
}

describe('agrupacionesAutomaticas', () => {
  it('dos tramos de la misma tarjeta se unen, con el id del de más saldo', () => {
    const r = agrupacionesAutomaticas([
      d({ id: 'compras', currentBalance: 851 }),
      d({ id: 'promo', currentBalance: 11286 }),
    ]);
    expect(r).toEqual([
      { id: 'compras', cardGroup: 'promo' },
      { id: 'promo', cardGroup: 'promo' },
    ]);
  });

  it('el banco escrito distinto sigue siendo el mismo', () => {
    expect(bancoNormalizado('BofA')).toBe(bancoNormalizado('Bank of America'));
    const r = agrupacionesAutomaticas([d({ id: 'a', issuer: 'BOFA' }), d({ id: 'b' })]);
    expect(r).toHaveLength(2);
  });

  it('si una ya tiene tarjeta, la suelta se une a esa', () => {
    const r = agrupacionesAutomaticas([
      d({ id: 'a', cardGroup: 'g1' }),
      d({ id: 'b', cardGroup: 'g1' }),
      d({ id: 'nuevo' }),
    ]);
    expect(r).toEqual([{ id: 'nuevo', cardGroup: 'g1' }]);
  });

  it('las que ya están unidas no se tocan', () => {
    expect(agrupacionesAutomaticas([d({ id: 'a', cardGroup: 'g' }), d({ id: 'b', cardGroup: 'g' })])).toEqual([]);
  });

  it('una separada a mano no se vuelve a unir', () => {
    expect(agrupacionesAutomaticas([d({ id: 'a' }), d({ id: 'b', cardGroupManual: true })])).toEqual([]);
  });

  it('otros dígitos, otro banco, una pagada o un préstamo no se mezclan', () => {
    expect(agrupacionesAutomaticas([d({ id: 'a' }), d({ id: 'b', accountLast4: '6791' })])).toEqual([]);
    expect(agrupacionesAutomaticas([d({ id: 'a' }), d({ id: 'b', issuer: 'Chase' })])).toEqual([]);
    expect(agrupacionesAutomaticas([d({ id: 'a' }), d({ id: 'b', status: 'paid_off' })])).toEqual([]);
    expect(agrupacionesAutomaticas([d({ id: 'a' }), d({ id: 'b', kind: 'loan' })])).toEqual([]);
  });

  it('sin cuatro dígitos no hay con qué saber que son la misma', () => {
    expect(agrupacionesAutomaticas([d({ id: 'a', accountLast4: null }), d({ id: 'b', accountLast4: null })])).toEqual([]);
  });
});
