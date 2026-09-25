import { describe, expect, it } from 'vitest';
import { SIN_FECHA, TRIPS_PER_PAGE, groupByMonth, monthKey, monthLabel, paginate } from './trip-months';

const t = (id: string, purchasedAt: string, totalAmount = 10) => ({ id, purchasedAt, totalAmount });

describe('monthKey', () => {
  it('saca el mes en UTC, como la fecha que enseña la lista', () => {
    // Medianoche UTC del 1 de septiembre: en Florida aún es 31 de agosto, pero
    // la lista escribe «01 sep». El bloque tiene que ser septiembre.
    expect(monthKey('2026-09-01T00:00:00.000Z')).toBe('2026-09');
    expect(monthKey('2026-08-31T23:59:59.999Z')).toBe('2026-08');
  });

  it('una compra de Súper la noche del 30 de septiembre es de septiembre', () => {
    // 02:00 UTC del 1 de octubre = 22:00 del 30 de septiembre en Miami. En UTC
    // caía en octubre: el bloque y la fecha de la fila se contradecían.
    expect(monthKey('2026-10-01T02:00:00.000Z')).toBe('2026-09');
  });

  it('una fecha ilegible no rompe nada', () => {
    expect(monthKey('no es una fecha')).toBe(SIN_FECHA);
  });
});

describe('monthLabel', () => {
  it('escribe el mes entero, con mayúscula y año', () => {
    expect(monthLabel('2026-09')).toBe('Septiembre de 2026');
    expect(monthLabel('2026-01')).toBe('Enero de 2026');
  });

  it('el grupo sin fecha se llama así', () => {
    expect(monthLabel(SIN_FECHA)).toBe('Sin fecha');
  });
});

describe('groupByMonth', () => {
  const trips = [
    t('a', '2026-08-10T00:00:00.000Z', 20),
    t('b', '2026-09-02T00:00:00.000Z', 13.77),
    t('c', '2026-09-07T00:00:00.000Z', 20.68),
    t('d', '2026-06-05T00:00:00.000Z', 38),
    t('e', '2026-08-22T00:00:00.000Z', 44.7),
  ];

  it('el mes más reciente primero', () => {
    expect(groupByMonth(trips).map((m) => m.key)).toEqual(['2026-09', '2026-08', '2026-06']);
  });

  it('dentro de cada mes, el ticket más reciente primero', () => {
    const [sep, ago] = groupByMonth(trips);
    expect(sep.trips.map((x) => x.id)).toEqual(['c', 'b']);
    expect(ago.trips.map((x) => x.id)).toEqual(['e', 'a']);
  });

  it('el total del mes suma sus tickets, a centavos', () => {
    const [sep, ago] = groupByMonth(trips);
    expect(sep.total).toBe(34.45);
    expect(ago.total).toBe(64.7);
  });

  it('no pierde ni duplica ningún ticket', () => {
    const todos = groupByMonth(trips).flatMap((m) => m.trips.map((x) => x.id));
    expect(todos.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('los tickets sin fecha van juntos, al final', () => {
    const meses = groupByMonth([t('x', 'basura'), ...trips]);
    expect(meses.at(-1)?.key).toBe(SIN_FECHA);
    expect(meses.at(-1)?.trips.map((x) => x.id)).toEqual(['x']);
  });

  it('sin tickets, sin meses', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe('paginate', () => {
  const once = Array.from({ length: 11 }, (_, i) => i + 1);

  it('de cinco en cinco: once tickets son tres páginas', () => {
    expect(TRIPS_PER_PAGE).toBe(5);
    expect(paginate(once, 0)).toEqual({ items: [1, 2, 3, 4, 5], page: 0, pages: 3 });
    expect(paginate(once, 2)).toEqual({ items: [11], page: 2, pages: 3 });
  });

  it('un mes corto es una sola página: no hace falta paginador', () => {
    expect(paginate([1, 2, 3], 0).pages).toBe(1);
  });

  it('una página que ya no existe cae en la última', () => {
    // Estaba en la página 3 de septiembre y el filtro dejó solo 2 tickets.
    expect(paginate([1, 2], 2)).toEqual({ items: [1, 2], page: 0, pages: 1 });
  });

  it('una página negativa o rara cae en la primera', () => {
    expect(paginate(once, -4).page).toBe(0);
    expect(paginate(once, Number.NaN).page).toBe(0);
  });

  it('un mes vacío es una página vacía, no cero páginas', () => {
    expect(paginate([], 0)).toEqual({ items: [], page: 0, pages: 1 });
  });
});
