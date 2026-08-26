import { describe, it, expect } from 'vitest';
import { buildHistoryWindow, monthKeyOf, budgetFigures } from './budget-history';

const NOW = new Date(2026, 6, 16); // 16 de julio de 2026

describe('buildHistoryWindow', () => {
  it('incluye el mes ACTUAL en la ventana', () => {
    const win = buildHistoryWindow([{ month: '2026-07', total: 46.33, trips: 1, personal: 46.33 }], NOW);
    const last = win.at(-1);
    expect(last?.month).toBe('2026-07');
    expect(last?.total).toBe(46.33);
  });

  it('recorta los meses vacíos del inicio: arranca en el primer mes con datos', () => {
    const win = buildHistoryWindow(
      [
        { month: '2026-06', total: 54, trips: 3, personal: 54 },
        { month: '2026-07', total: 46.33, trips: 1, personal: 46.33 },
      ],
      NOW,
    );
    // feb–may (sin datos) se recortan → jun, jul
    expect(win.map((m) => m.month)).toEqual(['2026-06', '2026-07']);
  });

  it('rellena con $0 los huecos intermedios pero no los recorta', () => {
    const win = buildHistoryWindow(
      [
        { month: '2026-04', total: 100, trips: 2, personal: 100 },
        { month: '2026-07', total: 46.33, trips: 1, personal: 46.33 },
      ],
      NOW,
    );
    expect(win.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    expect(win[1].total).toBe(0);
    expect(win[2].total).toBe(0);
  });

  it('sin datos deja al menos el mes actual', () => {
    const win = buildHistoryWindow([], NOW);
    expect(win).toEqual([{ month: '2026-07', total: 0, trips: 0, personal: 0 }]);
  });

  it('monthKeyOf cruza el año correctamente', () => {
    expect(monthKeyOf(new Date(2026, 0, 5))).toBe('2026-01');
    const win = buildHistoryWindow([{ month: '2025-12', total: 20, trips: 1, personal: 20 }], new Date(2026, 0, 5));
    expect(win[0].month).toBe('2025-12');
    expect(win.at(-1)?.month).toBe('2026-01');
  });
});

/**
 * Presupuesto tiene que poder mirar solo lo personal, igual que Pagos, Deudas y
 * Compras. Las cifras las calcula ESTA función, en el servidor y en la pantalla,
 * para que el titular y la gráfica no puedan discrepar.
 */
describe('budgetFigures', () => {
  const AHORA = new Date(2026, 7, 20); // agosto 2026
  const HISTORIA = [
    { month: '2026-06', total: 600, trips: 4, personal: 400 },
    { month: '2026-07', total: 800, trips: 5, personal: 600 },
    { month: '2026-08', total: 500, trips: 3, personal: 300 },
  ];

  it('con «todo» cuenta el gasto entero', () => {
    const f = budgetFigures(HISTORIA, 1000, 'all', AHORA);
    expect(f.spentThisMonth).toBe(500);
    // Promedio de los meses COMPLETOS: (600 + 800) / 2
    expect(f.avgMonthly).toBe(700);
    expect(f.remaining).toBe(500);
    expect(f.percentUsed).toBe(50);
  });

  it('con «personal» deja fuera lo del negocio', () => {
    const f = budgetFigures(HISTORIA, 1000, 'personal', AHORA);
    expect(f.spentThisMonth).toBe(300);
    expect(f.avgMonthly).toBe(500); // (400 + 600) / 2
    expect(f.remaining).toBe(700);
    expect(f.percentUsed).toBe(30);
  });

  it('con «negocio» cuenta solo su parte', () => {
    const f = budgetFigures(HISTORIA, 1000, 'business', AHORA);
    expect(f.spentThisMonth).toBe(200);
    expect(f.avgMonthly).toBe(200); // (200 + 200) / 2
  });

  it('el LÍMITE no se reparte: es una cifra que escribió el usuario', () => {
    // Lo que cambia es cuánto se lleva gastado contra él, no el límite.
    const todo = budgetFigures(HISTORIA, 1000, 'all', AHORA);
    const personal = budgetFigures(HISTORIA, 1000, 'personal', AHORA);
    expect(todo.remaining! - personal.remaining!).toBe(-200);
  });

  it('sin límite no hay porcentaje ni resto que enseñar', () => {
    const f = budgetFigures(HISTORIA, 0, 'personal', AHORA);
    expect(f.percentUsed).toBeNull();
    expect(f.remaining).toBeNull();
  });

  it('sin meses anteriores el promedio es 0, no una división por cero', () => {
    const f = budgetFigures([HISTORIA[2]], 1000, 'personal', AHORA);
    expect(f.avgMonthly).toBe(0);
    expect(f.spentThisMonth).toBe(300);
  });

  it('sin gasto este mes arranca en 0', () => {
    const f = budgetFigures([HISTORIA[0]], 1000, 'all', AHORA);
    expect(f.spentThisMonth).toBe(0);
  });
})
