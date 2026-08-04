import { describe, it, expect } from 'vitest';
import {
  buildInsights,
  buildStatsSummary,
  compareMonths,
  computeStockBreakdown,
  maxOf,
  monthKeyOf,
  previousMonthKey,
  type CategorySpend,
  type MonthSpend,
} from './stats-engine';

const NOW = new Date(2026, 7, 15); // 15 ago 2026

describe('computeStockBreakdown', () => {
  it('reparte la despensa en porcentajes', () => {
    const s = computeStockBreakdown({ full: 50, half: 30, empty: 20 });
    expect(s).toMatchObject({ total: 100, fullPct: 50, halfPct: 30, emptyPct: 20 });
  });

  it('los porcentajes SIEMPRE suman 100, sin el "101%" del redondeo suelto', () => {
    // 1/3 cada uno redondeado por separado da 33+33+33=99 (o 34+34+34=102).
    const s = computeStockBreakdown({ full: 1, half: 1, empty: 1 });
    expect(s.fullPct + s.halfPct + s.emptyPct).toBe(100);
  });

  it.each([
    [{ full: 2, half: 1, empty: 0 }],
    [{ full: 7, half: 7, empty: 7 }],
    [{ full: 1, half: 2, empty: 3 }],
    [{ full: 86, half: 5, empty: 9 }],
  ])('suman 100 con cualquier reparto (%j)', (stock) => {
    const s = computeStockBreakdown(stock);
    expect(s.fullPct + s.halfPct + s.emptyPct).toBe(100);
  });

  it('con la despensa vacía devuelve ceros, no NaN', () => {
    const s = computeStockBreakdown({ full: 0, half: 0, empty: 0 });
    expect(s).toMatchObject({ total: 0, fullPct: 0, halfPct: 0, emptyPct: 0 });
    expect(Number.isNaN(s.fullPct)).toBe(false);
  });

  it('ignora conteos negativos en vez de propagarlos', () => {
    const s = computeStockBreakdown({ full: -5, half: 10, empty: 0 });
    expect(s.full).toBe(0);
    expect(s.total).toBe(10);
  });
});

describe('claves de mes', () => {
  it('formatea el mes con dos dígitos', () => {
    expect(monthKeyOf(new Date(2026, 0, 5))).toBe('2026-01');
    expect(monthKeyOf(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('el mes anterior cruza bien el cambio de año', () => {
    expect(previousMonthKey(new Date(2026, 0, 15))).toBe('2025-12');
    expect(previousMonthKey(new Date(2026, 7, 15))).toBe('2026-07');
  });
});

describe('compareMonths', () => {
  const meses: MonthSpend[] = [
    { month: '2026-07', total: 400, trips: 5 },
    { month: '2026-08', total: 500, trips: 6 },
  ];

  it('compara este mes con el anterior', () => {
    expect(compareMonths(meses, NOW)).toEqual({ thisMonth: 500, lastMonth: 400, changePct: 25 });
  });

  it('devuelve null en vez de Infinity cuando el mes pasado fue 0', () => {
    const c = compareMonths([{ month: '2026-08', total: 500, trips: 6 }], NOW);
    expect(c.lastMonth).toBe(0);
    expect(c.changePct).toBeNull();
  });

  it('un mes recién empezado no rompe la comparación', () => {
    const c = compareMonths([{ month: '2026-07', total: 400, trips: 5 }], NOW);
    expect(c).toEqual({ thisMonth: 0, lastMonth: 400, changePct: -100 });
  });

  it('sin datos devuelve ceros', () => {
    expect(compareMonths([], NOW)).toEqual({ thisMonth: 0, lastMonth: 0, changePct: null });
  });
});

describe('maxOf', () => {
  it('devuelve el mayor', () => {
    expect(maxOf([3, 9, 1])).toBe(9);
  });

  it('nunca devuelve 0: se usa como divisor al pintar barras', () => {
    expect(maxOf([])).toBe(1);
    expect(maxOf([0, 0])).toBe(1);
  });
});

describe('buildInsights', () => {
  const cats: CategorySpend[] = [
    { category: 'Carnicería', currentMonth: 200, prevMonth: 100 }, // +100%
    { category: 'Lácteos', currentMonth: 50, prevMonth: 100 },      // −50%
    { category: 'Bebidas', currentMonth: 105, prevMonth: 100 },     // +5%, no llega
  ];

  it('cuenta la variación total del mes', () => {
    const i = buildInsights([], { thisMonth: 500, lastMonth: 400, changePct: 25 });
    expect(i[0].text).toBe('Gastaste 25% más en total este mes');
    expect(i[0].tone).toBe('up');
  });

  it('calla si la variación total es pequeña', () => {
    const i = buildInsights([], { thisMonth: 410, lastMonth: 400, changePct: 3 });
    expect(i).toEqual([]);
  });

  it('solo reporta las categorías que superan el umbral', () => {
    const i = buildInsights(cats, { thisMonth: 0, lastMonth: 0, changePct: null });
    expect(i.map((x) => x.id)).toEqual(['cat-Carnicería', 'cat-Lácteos']);
    expect(i.some((x) => x.id === 'cat-Bebidas')).toBe(false);
  });

  it('ordena por magnitud: con tope de 4, que salgan las que más se movieron', () => {
    const muchas: CategorySpend[] = [
      { category: 'A', currentMonth: 130, prevMonth: 100 }, // +30
      { category: 'B', currentMonth: 300, prevMonth: 100 }, // +200
      { category: 'C', currentMonth: 160, prevMonth: 100 }, // +60
      { category: 'D', currentMonth: 200, prevMonth: 100 }, // +100
      { category: 'E', currentMonth: 125, prevMonth: 100 }, // +25
    ];
    const i = buildInsights(muchas, { thisMonth: 0, lastMonth: 0, changePct: null });
    expect(i.map((x) => x.percent)).toEqual([200, 100, 60, 30]);
  });

  it('nunca devuelve más de 4', () => {
    const muchas: CategorySpend[] = Array.from({ length: 10 }, (_, n) => ({
      category: `C${n}`, currentMonth: 300, prevMonth: 100,
    }));
    expect(buildInsights(muchas, { thisMonth: 900, lastMonth: 300, changePct: 200 })).toHaveLength(4);
  });

  it('salta las categorías sin base de comparación, sin dividir por cero', () => {
    const i = buildInsights(
      [
        { category: 'Nueva', currentMonth: 100, prevMonth: 0 },
        { category: 'Abandonada', currentMonth: 0, prevMonth: 100 },
      ],
      { thisMonth: 0, lastMonth: 0, changePct: null },
    );
    expect(i).toEqual([]);
  });
});

describe('buildStatsSummary', () => {
  it('reúne todo lo que la página necesita', () => {
    const s = buildStatsSummary({
      stock: { full: 10, half: 5, empty: 5 },
      months: [
        { month: '2026-07', total: 400, trips: 5 },
        { month: '2026-08', total: 500, trips: 6 },
      ],
      categories: [{ category: 'Carnicería', currentMonth: 200, prevMonth: 100 }],
      stores: [{ name: 'Walmart', trips: 4, totalSpent: 300 }],
      now: NOW,
    });
    expect(s.stock.fullPct + s.stock.halfPct + s.stock.emptyPct).toBe(100);
    expect(s.comparison.changePct).toBe(25);
    expect(s.insights.length).toBeGreaterThan(0);
    expect(s.maxTrips).toBe(4);
    expect(s.maxSpend).toBe(500);
  });

  it('con todo vacío no lanza ni produce NaN', () => {
    const s = buildStatsSummary({
      stock: { full: 0, half: 0, empty: 0 }, months: [], categories: [], stores: [], now: NOW,
    });
    expect(s.maxTrips).toBe(1);
    expect(s.maxSpend).toBe(1);
    expect(s.insights).toEqual([]);
    expect(Number.isNaN(s.stock.fullPct)).toBe(false);
  });
});
