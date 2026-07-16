import { describe, it, expect } from 'vitest';
import { buildHistoryWindow, monthKeyOf } from './budget-history';

const NOW = new Date(2026, 6, 16); // 16 de julio de 2026

describe('buildHistoryWindow', () => {
  it('incluye el mes ACTUAL en la ventana', () => {
    const win = buildHistoryWindow([{ month: '2026-07', total: 46.33, trips: 1 }], NOW);
    const last = win.at(-1);
    expect(last?.month).toBe('2026-07');
    expect(last?.total).toBe(46.33);
  });

  it('recorta los meses vacíos del inicio: arranca en el primer mes con datos', () => {
    const win = buildHistoryWindow(
      [
        { month: '2026-06', total: 54, trips: 3 },
        { month: '2026-07', total: 46.33, trips: 1 },
      ],
      NOW,
    );
    // feb–may (sin datos) se recortan → jun, jul
    expect(win.map((m) => m.month)).toEqual(['2026-06', '2026-07']);
  });

  it('rellena con $0 los huecos intermedios pero no los recorta', () => {
    const win = buildHistoryWindow(
      [
        { month: '2026-04', total: 100, trips: 2 },
        { month: '2026-07', total: 46.33, trips: 1 },
      ],
      NOW,
    );
    expect(win.map((m) => m.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07']);
    expect(win[1].total).toBe(0);
    expect(win[2].total).toBe(0);
  });

  it('sin datos deja al menos el mes actual', () => {
    const win = buildHistoryWindow([], NOW);
    expect(win).toEqual([{ month: '2026-07', total: 0, trips: 0 }]);
  });

  it('monthKeyOf cruza el año correctamente', () => {
    expect(monthKeyOf(new Date(2026, 0, 5))).toBe('2026-01');
    const win = buildHistoryWindow([{ month: '2025-12', total: 20, trips: 1 }], new Date(2026, 0, 5));
    expect(win[0].month).toBe('2025-12');
    expect(win.at(-1)?.month).toBe('2026-01');
  });
});
