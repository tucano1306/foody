import { describe, expect, it } from 'vitest';
import { agruparPorTarjeta, sugerirDeudaParaMeta } from './plan-tarjetas';

const G = 'grupo-3650';

describe('agruparPorTarjeta', () => {
  const creditos = [
    { id: 'compras', cardGroup: G },
    { id: 'auto', cardGroup: null },
    { id: 'unlimited', cardGroup: G },
    { id: 'saldo-nuevo', cardGroup: G },
    { id: 'sola', cardGroup: 'grupo-de-uno' },
  ];

  it('junta los tramos de una tarjeta donde aparece el primero, sin cambiar el orden del resto', () => {
    const filas = agruparPorTarjeta(creditos);
    expect(filas.map((f) => (f.tipo === 'tarjeta' ? f.grupo : f.credito.id))).toEqual([G, 'auto', 'sola']);
    const tarjeta = filas[0];
    expect(tarjeta.tipo === 'tarjeta' && tarjeta.tramos.map((t) => t.id)).toEqual(['compras', 'unlimited', 'saldo-nuevo']);
  });

  it('una tarjeta de un solo tramo va suelta, como en Deudas', () => {
    const filas = agruparPorTarjeta(creditos);
    expect(filas[2]).toEqual({ tipo: 'suelto', credito: { id: 'sola', cardGroup: 'grupo-de-uno' } });
  });

  it('sin créditos, sin filas', () => {
    expect(agruparPorTarjeta([])).toEqual([]);
  });
});

describe('sugerirDeudaParaMeta', () => {
  // Las deudas y las dos metas del dueño el 31 oct 2026.
  const unlimited = { id: 'unlimited', name: 'Unlimited  Cash 3650', balance: 11286, accountLast4: '3650', promoEndsOn: '2027-01-25' };
  const compras = { id: 'compras', name: 'Compras 3650', balance: 1177.04, accountLast4: '3650', promoEndsOn: null };
  const saldoNuevo = { id: 'saldo-nuevo', name: 'Saldo nuevo 3650', balance: 553.4, accountLast4: '3650', promoEndsOn: null };
  const cashRewards = { id: '8523', name: 'Cash Rewards  8523', balance: 2153.22, accountLast4: '8523', promoEndsOn: null };
  const deudas = [unlimited, compras, saldoNuevo, cashRewards];

  const meta = (over: Partial<Parameters<typeof sugerirDeudaParaMeta>[0]>) => ({
    name: 'tarjeta 3650 cash rewards',
    kind: 'debt',
    targetAmount: 11440,
    targetDate: '2027-01-25',
    debtId: null,
    ...over,
  });

  it('la meta de $11,440 al 25 ene es el 0 % que acaba ese día', () => {
    expect(sugerirDeudaParaMeta(meta({}), deudas)).toBe(unlimited);
  });

  it('la de $1,014 al 25 oct podría ser cualquiera de los tres tramos: no se adivina', () => {
    expect(sugerirDeudaParaMeta(meta({ targetAmount: 1014, targetDate: '2026-10-25' }), deudas)).toBeNull();
  });

  it('«cash rewards» en el nombre no basta: manda el número de la tarjeta', () => {
    expect(sugerirDeudaParaMeta(meta({ name: 'cash rewards', targetAmount: 999, targetDate: null }), deudas)).toBeNull();
  });

  it('número y saldo casi igual bastan', () => {
    expect(sugerirDeudaParaMeta(meta({ name: 'Pagar la 8523', targetAmount: 2200, targetDate: null }), deudas)).toBe(cashRewards);
  });

  it('una meta que no es de deuda, o ya enlazada, no se toca', () => {
    expect(sugerirDeudaParaMeta(meta({ kind: 'trip' }), deudas)).toBeNull();
    expect(sugerirDeudaParaMeta(meta({ debtId: 'compras' }), deudas)).toBeNull();
  });

  it('una deuda ya pagada no se propone', () => {
    expect(sugerirDeudaParaMeta(meta({}), [{ ...unlimited, balance: 0 }])).toBeNull();
  });

  it('el último dígito declarado cuenta aunque el nombre no lo lleve', () => {
    const sinNumero = { ...unlimited, name: 'Unlimited Cash' };
    expect(sugerirDeudaParaMeta(meta({}), [sinNumero, compras])).toBe(sinNumero);
  });
});
