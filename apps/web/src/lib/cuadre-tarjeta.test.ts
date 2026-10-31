import { describe, expect, it } from 'vitest';
import {
  ajustesDeCuadre,
  diaDeVencimiento,
  diaDelEstado,
  estadoDelMinimo,
  leerCuadre,
  momentoDelCuadre,
  nombreDeSaldoNuevo,
  saldosAlCierre,
} from './cuadre-tarjeta';

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

  it('un saldo nuevo necesita saldo mayor que 0', () => {
    expect(leerCuadre({ ...BUENO, nuevos: [{ name: 'X', balance: 0, apr: 0 }] })).toHaveProperty('error');
  });

  // «El botón cuadrar la tarjeta no hace nada»: el saldo nuevo iba sin
  // nombre, el servidor lo rechazaba y el aviso salía fuera de la vista. El
  // estado no le da nombre a esos saldos; ahora se lo pone el servidor.
  it('un saldo nuevo sin nombre pasa, con el nombre vacío', () => {
    const cuadre = leerCuadre({ ...BUENO, nuevos: [{ name: '  ', balance: 553.4, apr: 23.99 }] });
    expect(cuadre).not.toHaveProperty('error');
    expect((cuadre as { nuevos: { name: string }[] }).nuevos[0].name).toBe('');
  });

  it('sin nada que cuadrar, error', () => {
    expect(leerCuadre({ ...BUENO, tramos: [], nuevos: [] })).toHaveProperty('error');
  });
});

/**
 * El caso que rompía el cuadre: el estado cierra, el mínimo se abona días
 * después (y se apunta en Foody), y luego se cuadra. El estado imprime el
 * saldo de ANTES del abono; Foody ya tiene el de después.
 */
describe('cuadrar después de abonar el mínimo', () => {
  const HOY = [
    { id: 'compras', balance: 800 },
    { id: 'promo', balance: 9900 }, // 10,000 al cierre − 100 del mínimo
  ];
  const ESTADO = [
    { debtId: 'compras', saldo: 1000 },
    { debtId: 'promo', saldo: 10000 },
  ];

  it('el saldo al cierre devuelve el abono posterior', () => {
    expect(saldosAlCierre(HOY, { promo: -100 })).toEqual([
      { id: 'compras', balance: 800 },
      { id: 'promo', balance: 10000 },
    ]);
  });

  it('el abono posterior NO se deshace: solo se ajusta lo que de verdad no cuadra', () => {
    expect(ajustesDeCuadre(saldosAlCierre(HOY, { promo: -100 }), ESTADO)).toEqual([{ debtId: 'compras', ajuste: 200 }]);
  });

  it('comparando con el saldo de hoy, el mínimo volvía a la deuda (lo que pasaba)', () => {
    expect(ajustesDeCuadre(HOY, ESTADO)).toContainEqual({ debtId: 'promo', ajuste: 100 });
  });

  it('un cargo o un interés posterior también se aparta del saldo al cierre', () => {
    expect(saldosAlCierre([{ id: 'compras', balance: 1050.5 }], { compras: 50.5 })).toEqual([
      { id: 'compras', balance: 1000 },
    ]);
  });

  it('cuadrar dos veces el mismo estado no ajusta dos veces', () => {
    // Tras el primer cuadre, compras ya está en 1,000 y el ajuste quedó en el
    // día del cierre: no cuenta como movido después.
    const trasElPrimero = [{ id: 'compras', balance: 1000 }, { id: 'promo', balance: 9900 }];
    expect(ajustesDeCuadre(saldosAlCierre(trasElPrimero, { promo: -100 }), ESTADO)).toEqual([]);
  });
});

describe('momentoDelCuadre', () => {
  it('se asienta al final del día del cierre', () => {
    expect(momentoDelCuadre('2026-10-25', new Date('2026-10-31T15:00:00Z')).toISOString()).toBe(
      '2026-10-25T23:59:59.999Z',
    );
  });

  it('cae ANTES del límite de «después del cierre» (cierre + 1 día)', () => {
    const cuando = momentoDelCuadre('2026-10-25', new Date('2026-10-31T15:00:00Z'));
    expect(cuando.getTime()).toBeLessThan(new Date('2026-10-26T00:00:00Z').getTime());
  });

  it('nunca en el futuro: cuadrado el mismo día del cierre, es ahora', () => {
    const ahora = new Date('2026-10-25T14:00:00Z');
    expect(momentoDelCuadre('2026-10-25', ahora)).toEqual(ahora);
  });
});

describe('nombreDeSaldoNuevo', () => {
  it('se llama como los otros tramos de la tarjeta', () => {
    expect(nombreDeSaldoNuevo('3650', false)).toBe('Saldo nuevo 3650');
    expect(nombreDeSaldoNuevo('3650', true)).toBe('Promoción 0 % 3650');
  });

  it('sin últimos dígitos, sin número', () => {
    expect(nombreDeSaldoNuevo(null, false)).toBe('Saldo nuevo');
  });
});

describe('diaDeVencimiento', () => {
  // Un tramo de la tarjeta tenía el 25 apuntado y el otro el 22, que es el
  // del estado; el cuadre proponía el 25 por mirar solo el primero.
  it('si los tramos no coinciden, el más temprano', () => {
    expect(diaDeVencimiento([{ dueDay: 25 }, { dueDay: 22 }])).toBe(22);
  });

  it('ignora los tramos sin día', () => {
    expect(diaDeVencimiento([{ dueDay: null }, { dueDay: 22 }])).toBe(22);
    expect(diaDeVencimiento([{ dueDay: null }])).toBeNull();
    expect(diaDeVencimiento([])).toBeNull();
  });
});

describe('diaDelEstado', () => {
  it('el día de la fecha y el último del mes', () => {
    expect(diaDelEstado('2026-11-22')).toEqual({ dia: 22, ultimo: 30 });
    expect(diaDelEstado('2027-02-28')).toEqual({ dia: 28, ultimo: 28 });
    expect(diaDelEstado('2028-02-29')).toEqual({ dia: 29, ultimo: 29 });
  });

  // La regla del UPDATE de saveCardStatement: el día apuntado se cambia solo
  // si `min(día, último) !== día de la fecha`.
  it('un cierre a fin de febrero no le cambia el 31 a una tarjeta que cierra los 31', () => {
    const { dia, ultimo } = diaDelEstado('2027-02-28');
    const cuadra = (apuntado: number) => Math.min(apuntado, ultimo) === dia;
    expect(cuadra(31)).toBe(true);
    expect(cuadra(28)).toBe(true);
    expect(cuadra(25)).toBe(false);
  });
});
