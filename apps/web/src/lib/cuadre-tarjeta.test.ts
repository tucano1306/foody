import { describe, expect, it } from 'vitest';
import { ajustesDeCuadre, estadoDelMinimo, leerCuadre } from './cuadre-tarjeta';

/**
 * Una tarjeta de dos tramos (compras y un adelanto al 0 %) cuyos saldos en
 * Foody se habían quedado por debajo de los del estado.
 */
describe('ajustesDeCuadre', () => {
  const FOODY = [
    { id: 'compras', balance: 851.01 },
    { id: 'lp36', balance: 11286 },
  ];

  it('cada tramo se ajusta por la diferencia con el estado', () => {
    expect(
      ajustesDeCuadre(FOODY, [
        { debtId: 'compras', saldo: 1177.04 },
        { debtId: 'lp36', saldo: 11440 },
      ]),
    ).toEqual([
      { debtId: 'compras', ajuste: 326.03 },
      { debtId: 'lp36', ajuste: 154 },
    ]);
  });

  it('un ajuste puede bajar la deuda', () => {
    expect(ajustesDeCuadre(FOODY, [{ debtId: 'lp36', saldo: 11000 }])).toEqual([{ debtId: 'lp36', ajuste: -286 }]);
  });

  it('si ya cuadra, no se asienta nada', () => {
    expect(ajustesDeCuadre(FOODY, [{ debtId: 'compras', saldo: 851.01 }, { debtId: 'lp36', saldo: 11286.004 }])).toEqual([]);
  });

  it('tramos ajenos a la tarjeta o saldos imposibles se ignoran', () => {
    expect(ajustesDeCuadre(FOODY, [{ debtId: 'otra', saldo: 50 }, { debtId: 'compras', saldo: -1 }])).toEqual([]);
  });
});

describe('estadoDelMinimo', () => {
  it('sin abonos desde el cierre falta el mínimo entero', () => {
    expect(estadoDelMinimo({ minimumDue: 154, paidSinceClosing: 0 })).toEqual({ cubierto: false, falta: 154 });
  });

  it('un abono parcial deja lo que falta', () => {
    expect(estadoDelMinimo({ minimumDue: 154, paidSinceClosing: 100 })).toEqual({ cubierto: false, falta: 54 });
  });

  it('cubierto con el mínimo o con más', () => {
    expect(estadoDelMinimo({ minimumDue: 154, paidSinceClosing: 154 })).toEqual({ cubierto: true, falta: 0 });
    expect(estadoDelMinimo({ minimumDue: 154, paidSinceClosing: 2000 })).toEqual({ cubierto: true, falta: 0 });
  });

  it('sin estado guardado no hay nada que decir', () => {
    expect(estadoDelMinimo(null)).toBeNull();
    expect(estadoDelMinimo({ minimumDue: 0, paidSinceClosing: 0 })).toBeNull();
  });
});

describe('leerCuadre', () => {
  const ID = '5b624994-e8d8-4e7f-926e-7f81447853f3';
  const BUENO = {
    closingDate: '2026-10-25',
    minimumDue: 154,
    dueDate: '2026-11-22',
    tramos: [{ debtId: ID, balance: 1177.04, apr: 23.99 }],
    nuevos: [{ name: 'Adelanto LP27 3650', balance: 553.4, apr: 23.99, promoEndsOn: null }],
  };

  it('acepta el estado de octubre de la 3650', () => {
    expect(leerCuadre(BUENO)).toEqual(BUENO);
  });

  it('sin cierre o sin mínimo no hay cuadre', () => {
    expect(leerCuadre({ ...BUENO, closingDate: '25/10/2026' })).toEqual({ error: expect.stringMatching(/cierre/) });
    expect(leerCuadre({ ...BUENO, minimumDue: -1 })).toEqual({ error: expect.stringMatching(/mínimo/) });
  });

  it('una fecha imposible no pasa', () => {
    expect(leerCuadre({ ...BUENO, dueDate: '2026-02-30' })).toEqual({ error: expect.stringMatching(/vencimiento/) });
  });

  it('saldos o tasas absurdos no pasan', () => {
    expect(leerCuadre({ ...BUENO, tramos: [{ debtId: ID, balance: -5, apr: null }] })).toHaveProperty('error');
    expect(leerCuadre({ ...BUENO, tramos: [{ debtId: ID, balance: 5, apr: 250 }] })).toHaveProperty('error');
    expect(leerCuadre({ ...BUENO, tramos: [{ debtId: 'x', balance: 5, apr: null }] })).toHaveProperty('error');
  });

  it('un saldo nuevo necesita nombre y saldo mayor que 0', () => {
    expect(leerCuadre({ ...BUENO, nuevos: [{ name: ' ', balance: 5, apr: 0 }] })).toHaveProperty('error');
    expect(leerCuadre({ ...BUENO, nuevos: [{ name: 'X', balance: 0, apr: 0 }] })).toHaveProperty('error');
  });

  it('sin nada que cuadrar, error', () => {
    expect(leerCuadre({ ...BUENO, tramos: [], nuevos: [] })).toHaveProperty('error');
  });
});
