import { describe, it, expect } from 'vitest';
import { EMPTY_OTHER_SPEND, computeOtherSpend, personalOtherSpend, type OtherSpendInput } from './other-spend';

// 22 de agosto de 2026: 22 días de 31 — pasada la primera semana, así que la
// proyección ya significa algo.
const NOW = new Date(2026, 7, 22, 12, 0, 0);

function input(over: Partial<OtherSpendInput> = {}): OtherSpendInput {
  return {
    monthlyTotals: [
      { month: '2026-06', total: 300, trips: 10 },
      { month: '2026-07', total: 200, trips: 8 },
      { month: '2026-08', total: 110, trips: 5 },
    ],
    byKind: [
      { kind: 'dining', currentMonth: 80, prevMonth: 40, count: 3 },
      { kind: 'fuel', currentMonth: 30, prevMonth: 60, count: 2 },
      { kind: 'pharmacy', currentMonth: 0, prevMonth: 25, count: 0 },
    ],
    places: [
      { name: 'Pollo Tropical', total: 60, count: 2 },
      { name: 'Shell', total: 30, count: 2 },
      { name: 'Subway', total: 20, count: 1 },
      { name: 'Otro', total: 5, count: 1 },
    ],
    now: NOW,
    ...over,
  };
}

describe('computeOtherSpend', () => {
  it('lee el mes en curso de los totales', () => {
    const r = computeOtherSpend(input());
    expect(r.spentThisMonth).toBe(110);
    expect(r.countThisMonth).toBe(5);
    expect(r.hasData).toBe(true);
  });

  it('promedia solo los meses cerrados', () => {
    const r = computeOtherSpend(input());
    expect(r.monthsWithData).toBe(2);
    expect(r.avgMonthly).toBe(250); // (300 + 200) / 2 — el mes en curso no cuenta
    expect(r.lastMonth).toBe(200);
  });

  it('proyecta el cierre al ritmo del mes', () => {
    const r = computeOtherSpend(input());
    // 110 en 22 días = $5/día × 31
    expect(r.projectedMonthEnd).toBe(155);
  });

  it('reparte por tipo y descarta los que no gastaron nada', () => {
    const r = computeOtherSpend(input());
    expect(r.byKind.map((k) => k.kind)).toEqual(['dining', 'fuel']);
    const dining = r.byKind[0];
    expect(dining.currentMonth).toBe(80);
    expect(dining.share).toBeCloseTo(72.73, 1);
    expect(dining.deltaPct).toBe(100); // 40 → 80
    expect(r.byKind[1].deltaPct).toBe(-50); // 60 → 30
  });

  it('el que más subió se mide en dinero, no en porcentaje', () => {
    const r = computeOtherSpend(
      input({
        byKind: [
          { kind: 'dining', currentMonth: 90, prevMonth: 50, count: 4 },   // +40
          { kind: 'pharmacy', currentMonth: 12, prevMonth: 2, count: 1 },  // +10 pero +500 %
        ],
      }),
    );
    expect(r.biggestMover?.kind).toBe('dining');
  });

  it('sin subidas no hay culpable', () => {
    const r = computeOtherSpend(
      input({ byKind: [{ kind: 'fuel', currentMonth: 30, prevMonth: 60, count: 2 }] }),
    );
    expect(r.biggestMover).toBeNull();
  });

  it('recorta los lugares a los tres primeros', () => {
    expect(computeOtherSpend(input()).topPlaces).toHaveLength(3);
  });

  it('devuelve un baseline que el plan puede restar', () => {
    const r = computeOtherSpend(input());
    // Con dos meses cerrados se pondera ritmo e historial, y nunca baja de lo
    // ya gastado.
    expect(r.baseline).toBeGreaterThanOrEqual(r.spentThisMonth);
    expect(r.baselineSource).toBe('pace');
  });

  it('sin nada registrado no resta nada ni se muestra', () => {
    const r = computeOtherSpend({ monthlyTotals: [], byKind: [], places: [], now: NOW });
    expect(r.baseline).toBe(0);
    expect(r.baselineSource).toBe('none');
    expect(r.hasData).toBe(false);
    expect(r.trendPct).toBeNull();
    // El calendario sí es real aunque no haya gasto: día 22 de 31.
    expect(r).toEqual({ ...EMPTY_OTHER_SPEND, hasData: false, daysElapsed: 22, daysInMonth: 31 });
  });

  it('con historial pero sin gasto este mes sigue restando el promedio', () => {
    // Un mes sin registrar no significa que se dejó de comer fuera: si el plan
    // bajara a 0 prometería un dinero que no existe.
    const r = computeOtherSpend(
      input({
        monthlyTotals: [
          { month: '2026-06', total: 300, trips: 10 },
          { month: '2026-07', total: 200, trips: 8 },
        ],
        byKind: [],
      }),
    );
    expect(r.spentThisMonth).toBe(0);
    expect(r.baseline).toBe(250);
    expect(r.baselineSource).toBe('average');
    expect(r.hasData).toBe(true);
  });

  it('el primer mes de datos no proyecta un mes carísimo por una compra del día 2', () => {
    const early = new Date(2026, 7, 2, 12, 0, 0);
    const r = computeOtherSpend({
      monthlyTotals: [{ month: '2026-08', total: 120, trips: 1 }],
      byKind: [{ kind: 'dining', currentMonth: 120, prevMonth: 0, count: 1 }],
      places: [],
      now: early,
    });
    // Sin historial y antes del día 7, el baseline es lo ya gastado — no los
    // $1.860 que saldrían de extrapolar un solo ticket.
    expect(r.baseline).toBe(120);
  });

  it('no divide entre cero cuando el mes va en cero', () => {
    const r = computeOtherSpend(
      input({ monthlyTotals: [{ month: '2026-08', total: 0, trips: 0 }], byKind: [] }),
    );
    expect(r.projectedMonthEnd).toBe(0);
    expect(r.trendPct).toBeNull();
    expect(r.byKind).toEqual([]);
  });

  it('calcula la tendencia contra el promedio', () => {
    const r = computeOtherSpend(input());
    // 155 proyectado contra 250 de promedio = −38 %
    expect(r.trendPct).toBeCloseTo(-38, 0);
  });
});

/**
 * «Fuera del super» no tenía gráfico ni ritmo: era una cifra suelta sin
 * historia, mientras «Gastos en comida» enseñaba las dos cosas.
 */
describe('computeOtherSpend — historial y ritmo', () => {
  it('el historial va del primer mes con gasto al actual', () => {
    const r = computeOtherSpend(input());
    expect(r.history.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(r.history.map((m) => m.total)).toEqual([300, 200, 110]);
  });

  it('un mes sin gasto entre medias sale a cero, no desaparece', () => {
    const r = computeOtherSpend(input({
      monthlyTotals: [
        { month: '2026-05', total: 90, trips: 3 },
        { month: '2026-08', total: 40, trips: 1 },
      ],
    }));
    expect(r.history.map((m) => [m.month, m.total])).toEqual([
      ['2026-05', 90], ['2026-06', 0], ['2026-07', 0], ['2026-08', 40],
    ]);
  });

  it('sin gasto este mes, el mes actual sale a cero al final', () => {
    const r = computeOtherSpend(input({ monthlyTotals: [{ month: '2026-07', total: 200, trips: 8 }] }));
    expect(r.history.at(-1)).toEqual({ month: '2026-08', total: 0, trips: 0 });
  });

  it('el ritmo diario y cuándo significa algo', () => {
    const r = computeOtherSpend(input());
    expect(r.daysElapsed).toBe(22);
    expect(r.daysInMonth).toBe(31);
    expect(r.dailyPace).toBe(5); // 110 / 22
    expect(r.paceIsMeaningful).toBe(true);

    const temprano = computeOtherSpend(input({ now: new Date(2026, 7, 3, 12) }));
    expect(temprano.paceIsMeaningful).toBe(false);
  });

  it('sin nada, historial vacío', () => {
    expect(computeOtherSpend(input({ monthlyTotals: [], byKind: [], places: [] })).history).toEqual([]);
  });
});

describe('personalOtherSpend — también las barras', () => {
  it('con el negocio apagado, el historial y el ritmo enseñan solo lo personal', () => {
    const r = personalOtherSpend(computeOtherSpend(input()), 50);
    expect(r.history.map((m) => m.total)).toEqual([150, 100, 55]);
    expect(r.dailyPace).toBe(2.5);
  });
});
