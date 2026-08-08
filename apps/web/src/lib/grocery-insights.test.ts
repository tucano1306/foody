import { describe, it, expect } from 'vitest';
import {
  chooseBaseline,
  computeGroceryInsight,
  monthKeyOf,
  UNITEMIZED_LABEL,
  type GroceryInsightInput,
} from './grocery-insights';

// 22 de julio de 2026: 21 días transcurridos de 31 → confianza 0.71
const NOW = new Date(2026, 6, 22, 12, 0, 0);

function input(over: Partial<GroceryInsightInput> = {}): GroceryInsightInput {
  return {
    monthlyTotals: [
      { month: '2026-05', total: 600, trips: 8 },
      { month: '2026-06', total: 500, trips: 7 },
      { month: '2026-07', total: 420, trips: 5 },
    ],
    categories: [
      { category: 'carnes', currentMonth: 180, prevMonth: 120 },
      { category: 'frutas y verduras', currentMonth: 140, prevMonth: 150 },
      { category: 'bebidas', currentMonth: 100, prevMonth: 60 },
      { category: 'limpieza', currentMonth: 0, prevMonth: 40 },
    ],
    stores: [
      { name: 'Walmart', total: 300, trips: 3 },
      { name: 'Soriana', total: 120, trips: 2 },
    ],
    limit: 500,
    now: NOW,
    ...over,
  };
}

describe('monthKeyOf', () => {
  it('usa el mes local, no UTC', () => {
    expect(monthKeyOf(new Date(2026, 6, 22))).toBe('2026-07');
    expect(monthKeyOf(new Date(2026, 0, 1))).toBe('2026-01');
  });
});

describe('computeGroceryInsight — ritmo del mes', () => {
  it('proyecta el cierre del mes con el gasto diario real', () => {
    const g = computeGroceryInsight(input());
    expect(g.spentThisMonth).toBe(420);
    expect(g.daysElapsed).toBe(22);
    expect(g.daysInMonth).toBe(31);
    expect(g.dailyPace).toBeCloseTo(19.09, 1);
    expect(g.projectedMonthEnd).toBeCloseTo(591.82, 1);
  });

  it('promedia solo los meses anteriores con datos', () => {
    const g = computeGroceryInsight(input());
    expect(g.avgMonthly).toBe(550); // (600 + 500) / 2
    expect(g.lastMonth).toBe(500);
    expect(g.monthsWithData).toBe(2);
  });

  it('detecta que se va a pasar del límite', () => {
    const g = computeGroceryInsight(input());
    expect(g.overLimit).toBeCloseTo(91.82, 1);
    expect(g.trendPct).toBeCloseTo(7.6, 0);
  });

  it('no deja que un único mes atípico hunda la estimación del plan', () => {
    // Caso real: junio flojo ($58) y julio disparado — el plan debe restar lo
    // que de verdad se va a gastar, no un promedio de un solo mes.
    const g = computeGroceryInsight(
      input({ monthlyTotals: [
        { month: '2026-06', total: 58.28, trips: 4 },
        { month: '2026-07', total: 304.39, trips: 2 },
      ] }),
    );
    expect(g.monthsWithData).toBe(1);
    expect(g.projectedMonthEnd).toBeCloseTo(428.91, 1);
    expect(g.baseline).toBeCloseTo(428.91, 1);
    expect(g.baselineSource).toBe('pace');
  });

  it('marca tendencia negativa cuando el mes va flojo', () => {
    const g = computeGroceryInsight(
      input({ monthlyTotals: [
        { month: '2026-05', total: 900, trips: 9 },
        { month: '2026-06', total: 900, trips: 9 },
        { month: '2026-07', total: 200, trips: 2 },
      ] }),
    );
    expect(g.trendPct).toBeLessThan(-60);
  });
});

describe('chooseBaseline', () => {
  const base = {
    spentThisMonth: 420,
    projectedMonthEnd: 591.82,
    avgMonthly: 550,
    limit: 500,
    daysElapsed: 22,
    daysInMonth: 31,
    monthsWithData: 3,
  };

  it('con historial fiable mezcla proyección e historial según los días transcurridos', () => {
    const { baseline, source } = chooseBaseline(base);
    // 591.82 * 0.71 + 550 * 0.29 ≈ 579.7
    expect(baseline).toBeCloseTo(579.69, 0);
    expect(source).toBe('pace');
  });

  it('a principio de mes no proyecta desde un solo ticket', () => {
    const temprano = chooseBaseline({ ...base, spentThisMonth: 200, projectedMonthEnd: 3000, daysElapsed: 2 });
    // Con 2 días la proyección se descarta: pondera lo ya gastado con el promedio.
    expect(temprano.baseline).toBeCloseTo(527.4, 0);
    expect(temprano.baseline).toBeLessThan(600);
  });

  it('con un solo mes de historial toma la señal más alta, no el promedio flojo', () => {
    const { baseline } = chooseBaseline({ ...base, avgMonthly: 58, monthsWithData: 1 });
    expect(baseline).toBeCloseTo(591.82, 1); // la proyección, no una mezcla hacia $58
  });

  it('nunca queda por debajo de lo ya gastado', () => {
    const { baseline } = chooseBaseline({ ...base, spentThisMonth: 800, projectedMonthEnd: 850, avgMonthly: 300, daysElapsed: 28 });
    expect(baseline).toBeGreaterThanOrEqual(800);
  });

  it('usa el promedio si el mes aún no tiene compras', () => {
    const { baseline, source } = chooseBaseline({ ...base, spentThisMonth: 0, projectedMonthEnd: 0 });
    expect(baseline).toBe(550);
    expect(source).toBe('average');
  });

  it('usa solo la proyección cuando no hay historial', () => {
    const { baseline, source } = chooseBaseline({ ...base, avgMonthly: 0, monthsWithData: 0 });
    expect(baseline).toBeCloseTo(591.82, 1);
    expect(source).toBe('pace');
  });

  it('cae al límite si no hay ninguna compra registrada', () => {
    const { baseline, source } = chooseBaseline({ ...base, spentThisMonth: 0, projectedMonthEnd: 0, avgMonthly: 0, monthsWithData: 0 });
    expect(baseline).toBe(500);
    expect(source).toBe('limit');
  });

  it('reporta "none" sin compras ni límite', () => {
    const { baseline, source } = chooseBaseline({ ...base, spentThisMonth: 0, projectedMonthEnd: 0, avgMonthly: 0, limit: 0, monthsWithData: 0 });
    expect(baseline).toBe(0);
    expect(source).toBe('none');
  });
});

describe('computeGroceryInsight — categorías', () => {
  it('ordena por gasto del mes y calcula participación y variación', () => {
    const g = computeGroceryInsight(input());
    expect(g.categories[0].category).toBe('carnes');
    expect(g.categories[0].share).toBeCloseTo(42.86, 1); // 180 de 420
    expect(g.categories[0].deltaPct).toBeCloseTo(50, 1); // 180 vs 120
  });

  it('identifica la categoría que más subió en dinero, no en porcentaje', () => {
    const g = computeGroceryInsight(input());
    // bebidas subió +67% pero solo $40; carnes subió 50% y $60.
    expect(g.biggestMover?.category).toBe('carnes');
  });

  it('no reporta movimiento si ninguna categoría subió', () => {
    const g = computeGroceryInsight(
      input({ categories: [{ category: 'carnes', currentMonth: 50, prevMonth: 200 }] }),
    );
    expect(g.biggestMover).toBeNull();
  });

  it('lista solo lo gastado ESTE mes, sin filas fantasma', () => {
    // Una categoría con gasto el mes pasado pero $0 este mes salía en la UI
    // como "Café $0 −100%" los primeros días del mes.
    const g = computeGroceryInsight(
      input({ categories: [
        { category: 'carnes', currentMonth: 100, prevMonth: 0 },
        { category: 'café', currentMonth: 0, prevMonth: 45 },
        { category: 'vacía', currentMonth: 0, prevMonth: 0 },
      ] }),
    );
    expect(g.categories.map((c) => c.category)).toEqual(['carnes']);
  });
});

describe('paceIsMeaningful — cuándo la UI puede hablar del ritmo', () => {
  it('es falso al arrancar el mes, aunque haya historial', () => {
    const g = computeGroceryInsight(
      input({ now: new Date(2026, 7, 3), monthlyTotals: [
        { month: '2026-06', total: 500, trips: 6 },
        { month: '2026-07', total: 600, trips: 7 },
      ] }),
    );
    expect(g.daysElapsed).toBe(3);
    expect(g.paceIsMeaningful).toBe(false);
  });

  it('es falso si el mes ya avanzó pero no hay compras', () => {
    const g = computeGroceryInsight(
      input({ monthlyTotals: [
        { month: '2026-06', total: 500, trips: 6 },
        { month: '2026-07', total: 0, trips: 0 },
      ] }),
    );
    expect(g.spentThisMonth).toBe(0);
    expect(g.paceIsMeaningful).toBe(false);
  });

  it('es verdadero con días y compras suficientes', () => {
    const g = computeGroceryInsight(input()); // día 22, $420 gastados
    expect(g.paceIsMeaningful).toBe(true);
  });
});

describe('computeGroceryInsight — sin datos', () => {
  it('devuelve el límite y cero ruido cuando no hay compras', () => {
    const g = computeGroceryInsight({ monthlyTotals: [], categories: [], stores: [], limit: 400, now: NOW });
    expect(g.baseline).toBe(400);
    expect(g.baselineSource).toBe('limit');
    expect(g.trendPct).toBeNull();
    expect(g.categories).toEqual([]);
    expect(g.overLimit).toBeCloseTo(-400, 1);
  });
});

describe('unitemized — el desglose tiene que cuadrar con el total', () => {
  // El bug que motivó esto: el mes decía "llevas $104" y "En qué se va este
  // mes" sumaba $23. Los $81 restantes eran tickets escaneados sin productos
  // vinculados — el usuario los registraba y no los veía en ninguna parte.
  it('declara la parte del mes que ningún producto explica', () => {
    const g = computeGroceryInsight(
      input({
        monthlyTotals: [
          { month: '2026-06', total: 500, trips: 6 },
          { month: '2026-07', total: 104, trips: 5 },
        ],
        categories: [
          { category: 'otro', currentMonth: 13, prevMonth: 35 },
          { category: 'Sin categoría', currentMonth: 10, prevMonth: 5 },
        ],
      }),
    );
    expect(g.spentThisMonth).toBe(104);
    expect(g.unitemized?.currentMonth).toBe(81);
    expect(g.unitemized?.category).toBe(UNITEMIZED_LABEL);
    // Y ahora el desglose completo cuadra con el total del mes.
    const shown = g.categories.reduce((s, c) => s + c.currentMonth, 0) + (g.unitemized?.currentMonth ?? 0);
    expect(shown).toBeCloseTo(g.spentThisMonth, 2);
  });

  it('reparte el 100 % entre categorías y resto', () => {
    const g = computeGroceryInsight(
      input({
        monthlyTotals: [{ month: '2026-07', total: 200, trips: 3 }],
        categories: [{ category: 'carnes', currentMonth: 50, prevMonth: 0 }],
      }),
    );
    expect(g.categories[0].share).toBe(25);
    expect(g.unitemized?.share).toBe(75);
  });

  it('calla cuando el ticket está entero desglosado', () => {
    const g = computeGroceryInsight(
      input({
        monthlyTotals: [{ month: '2026-07', total: 150, trips: 2 }],
        categories: [
          { category: 'carnes', currentMonth: 100, prevMonth: 0 },
          { category: 'bebidas', currentMonth: 50, prevMonth: 0 },
        ],
      }),
    );
    expect(g.unitemized).toBeNull();
  });

  it('calla ante centavos de redondeo del reparto', () => {
    const g = computeGroceryInsight(
      input({
        monthlyTotals: [{ month: '2026-07', total: 100.2, trips: 1 }],
        categories: [{ category: 'carnes', currentMonth: 100, prevMonth: 0 }],
      }),
    );
    expect(g.unitemized).toBeNull();
  });

  it('nunca inventa un hueco negativo', () => {
    // Las compras sueltas sin ticket pueden sumar más que su "visita": el hueco
    // no puede salir en negativo ni restarle al desglose.
    const g = computeGroceryInsight(
      input({
        monthlyTotals: [{ month: '2026-07', total: 50, trips: 1 }],
        categories: [{ category: 'carnes', currentMonth: 90, prevMonth: 0 }],
      }),
    );
    expect(g.unitemized).toBeNull();
  });

  it('compara contra el mes de CALENDARIO anterior, no contra el último con datos', () => {
    // Junio $300, julio vacío, agosto $100: el resto de agosto se compara con
    // julio (0 → sin porcentaje), no con junio.
    const g = computeGroceryInsight(
      input({
        now: new Date(2026, 7, 22, 12, 0, 0),
        monthlyTotals: [
          { month: '2026-06', total: 300, trips: 4 },
          { month: '2026-08', total: 100, trips: 2 },
        ],
        categories: [],
      }),
    );
    expect(g.unitemized?.currentMonth).toBe(100);
    expect(g.unitemized?.prevMonth).toBe(0);
    expect(g.unitemized?.deltaPct).toBeNull();
  });

  it('no entra en las categorías ni en el consejero', () => {
    // Si entrara, el consejo diría "recorta un 15 % en Sin detallar", que no
    // significa nada accionable.
    const g = computeGroceryInsight(
      input({
        monthlyTotals: [
          { month: '2026-06', total: 300, trips: 4 },
          { month: '2026-07', total: 400, trips: 5 },
        ],
        categories: [{ category: 'carnes', currentMonth: 20, prevMonth: 10 }],
      }),
    );
    expect(g.categories.map((c) => c.category)).toEqual(['carnes']);
    expect(g.biggestMover?.category).toBe('carnes');
  });
});
