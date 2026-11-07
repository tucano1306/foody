import { describe, expect, it } from 'vitest';
import { clavesDeLaCuenta, idsFueraDelPlan, resumenDeLoVisible } from './fuera-del-plan';

/**
 * «En el Plan me salen las 3 tarjetas, que no son metas; las quiero quitar de
 * allí sin que se borren en Deudas». Aquí, qué se queda fuera del Plan: la
 * cuenta entera, se haya guardado con la clave que se haya guardado.
 */

const G = '339896bb-13c0-4337-aed2-914c7c099954';
const tarjeta = [
  { id: G, cardGroup: G },
  { id: 'compras', cardGroup: G },
  { id: 'saldo-nuevo', cardGroup: G },
];
const suelta = { id: '6791', cardGroup: null };
const otra = { id: '8523', cardGroup: null };
const todas = [...tarjeta, suelta, otra];

describe('qué se queda fuera del Plan', () => {
  it('sin nada guardado, todo se ve', () => {
    expect(idsFueraDelPlan(todas, new Set())).toEqual(new Set());
  });

  it('una tarjeta con tramos sale entera: los tres saldos, y nada más', () => {
    expect(idsFueraDelPlan(todas, new Set([G]))).toEqual(new Set([G, 'compras', 'saldo-nuevo']));
  });

  it('una tarjeta suelta sale sola', () => {
    expect(idsFueraDelPlan(todas, new Set(['6791']))).toEqual(new Set(['6791']));
  });

  it('las tres cuentas a la vez', () => {
    expect(idsFueraDelPlan(todas, new Set([G, '6791', '8523']))).toEqual(
      new Set([G, 'compras', 'saldo-nuevo', '6791', '8523']),
    );
  });

  it('una suelta que se quitó y luego ganó un tramo nuevo sigue fuera, con sus dos saldos', () => {
    // Se guardó cuando era suelta (clave = su id); hoy su grupo lleva el id del
    // tramo con más saldo, que es el nuevo.
    const crecida = [{ id: '6791', cardGroup: 'nuevo' }, { id: 'nuevo', cardGroup: 'nuevo' }];
    expect(idsFueraDelPlan(crecida, new Set(['6791']))).toEqual(new Set(['6791', 'nuevo']));
  });

  it('una clave que ya no corresponde a ninguna cuenta no esconde nada', () => {
    expect(idsFueraDelPlan(todas, new Set(['de-otra-cosa']))).toEqual(new Set());
  });
});

describe('qué se borra para devolverla al Plan', () => {
  it('la clave de la cuenta y la de cada tramo, sin repetir', () => {
    expect(clavesDeLaCuenta(tarjeta).sort()).toEqual([G, 'compras', 'saldo-nuevo'].sort());
  });

  it('una suelta: solo su id', () => {
    expect(clavesDeLaCuenta([suelta])).toEqual(['6791']);
  });
});

describe('los totales de lo que se ve', () => {
  const filas = [
    { balance: 1177.04, installment: 158, monthlyInterest: 23.53, countedInPayments: false },
    { balance: 11286, installment: 3762, monthlyInterest: 0, countedInPayments: false },
    { balance: 553.4, installment: 16.6, monthlyInterest: 11.06, countedInPayments: false },
    { balance: 6052, installment: 550, monthlyInterest: 0, countedInPayments: true },
  ];

  it('suma saldo e interés de todo, y la cuota solo de lo que no cobra ya un recibo', () => {
    expect(resumenDeLoVisible(filas)).toEqual({ balance: 19068.44, monthlyInterest: 34.59, payments: 3936.6 });
  });

  it('sin filas, ceros: la sección no se pinta y nada divide entre cero', () => {
    expect(resumenDeLoVisible([])).toEqual({ balance: 0, monthlyInterest: 0, payments: 0 });
  });

  it('redondea a centavos lo que la coma flotante descuadra', () => {
    expect(resumenDeLoVisible([
      { balance: 0.1, installment: 0.1, monthlyInterest: 0.1, countedInPayments: false },
      { balance: 0.2, installment: 0.2, monthlyInterest: 0.2, countedInPayments: false },
    ])).toEqual({ balance: 0.3, monthlyInterest: 0.3, payments: 0.3 });
  });
});
