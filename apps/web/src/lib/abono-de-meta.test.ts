import { describe, expect, it } from 'vitest';
import type { DebtWithProjection, DebtsSnapshot } from './debt-data';
import { destinoDelAbono } from './abono-de-meta';

const GRUPO = '66666666-6666-4666-8666-666666666666';

/** Lo justo de una deuda para decidir a dónde va el abono. */
function d(id: string, over: Partial<DebtWithProjection> = {}): DebtWithProjection {
  return { id, name: id, cardGroup: GRUPO, status: 'active', currentBalance: 100, ...over } as DebtWithProjection;
}

function snap(debts: DebtWithProjection[], extra: Partial<DebtsSnapshot> = {}): DebtsSnapshot {
  return { debts, portfolio: {} as DebtsSnapshot['portfolio'], ...extra };
}

describe('destinoDelAbono — el abono de una meta va a Deudas', () => {
  it('un tramo de una tarjeta de varios saldos abona la TARJETA, con su estado y sus condiciones', () => {
    const estado = { cardGroup: GRUPO, closingDate: '2026-10-25', minimumDue: 154, dueDate: '2026-11-22', newBalance: 300, paidSinceClosing: 0 };
    const r = destinoDelAbono(
      snap([d('a'), d('b'), d('otra', { cardGroup: null })], { cardStatements: { [GRUPO]: estado } }),
      'a',
    );
    expect(r.tipo).toBe('tarjeta');
    if (r.tipo !== 'tarjeta') return;
    expect(r.grupo).toBe(GRUPO);
    expect(r.tramos.map((t) => t.id)).toEqual(['a', 'b']);
    expect(r.estado).toBe(estado);
    expect(r.condiciones).toBeNull();
  });

  it('un tramo ya liquidado sigue llevando a su tarjeta si a ella le queda saldo', () => {
    const r = destinoDelAbono(snap([d('a', { status: 'paid_off', currentBalance: 0 }), d('b'), d('c')]), 'a');
    expect(r.tipo).toBe('tarjeta');
    if (r.tipo === 'tarjeta') expect(r.tramos.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('una tarjeta con un solo tramo activo se abona como deuda suelta, igual que en Deudas', () => {
    const r = destinoDelAbono(snap([d('a'), d('b', { status: 'paid_off', currentBalance: 0 })]), 'a');
    expect(r).toMatchObject({ tipo: 'deuda', debt: { id: 'a' } });
  });

  it('una deuda suelta se abona a sí misma', () => {
    expect(destinoDelAbono(snap([d('x', { cardGroup: null })]), 'x')).toMatchObject({ tipo: 'deuda', debt: { id: 'x' } });
  });

  it('liquidada no abre nada', () => {
    expect(destinoDelAbono(snap([d('x', { cardGroup: null, status: 'paid_off', currentBalance: 0 })]), 'x')).toEqual({
      tipo: 'nada',
      motivo: 'liquidada',
    });
    expect(destinoDelAbono(snap([d('a', { currentBalance: 0 }), d('b', { currentBalance: 0 })]), 'a')).toEqual({
      tipo: 'nada',
      motivo: 'liquidada',
    });
  });

  it('en la papelera o que ya no existe, tampoco', () => {
    expect(destinoDelAbono(snap([d('x', { status: 'archived' })]), 'x')).toEqual({ tipo: 'nada', motivo: 'no_esta' });
    expect(destinoDelAbono(snap([]), 'x')).toEqual({ tipo: 'nada', motivo: 'no_esta' });
  });
});
