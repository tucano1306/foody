import { describe, expect, it } from 'vitest';
import { ritmoDeCompras } from './ritmo-compras';

// Mediodía en Miami: ningún ticket cae en otro día por la zona horaria.
const t = (fecha: string, totalAmount: number) => ({ purchasedAt: `${fecha}T16:00:00.000Z`, totalAmount });
const HOY = { year: 2026, month: 10, day: 10 };

describe('ritmoDeCompras', () => {
  it('compara con lo que solías llevar a estas alturas, no con el mes entero', () => {
    const r = ritmoDeCompras(
      [
        t('2026-08-03', 100), t('2026-08-25', 200), // agosto: 100 hasta el día 10, 300 entero
        t('2026-09-09', 60), t('2026-09-20', 140), //  septiembre: 60 hasta el 10, 200 entero
        t('2026-10-02', 50), t('2026-10-08', 30), //   octubre, en curso
      ],
      HOY,
    );
    expect(r.actual).toBe(80);
    expect(r.comprasActual).toBe(2);
    expect(r.habitualHastaHoy).toBe(80); // (100 + 60) / 2
    expect(r.mediaMensual).toBe(250); //    (300 + 200) / 2
  });

  it('las barras empiezan en el primer mes con tickets, no antes', () => {
    const r = ritmoDeCompras([t('2026-09-15', 40), t('2026-10-01', 10)], HOY);
    expect(r.barras.map((b) => b.key)).toEqual(['2026-09', '2026-10']);
    expect(r.barras.map((b) => b.etiqueta)).toEqual(['sep', 'oct']);
    expect(r.barras[1].actual).toBe(true);
  });

  it('un mes sin compras ENTRE meses con compras cuenta como cero', () => {
    const r = ritmoDeCompras([t('2026-07-05', 90), t('2026-09-05', 30)], HOY);
    expect(r.barras.map((b) => b.total)).toEqual([90, 0, 30, 0]);
    expect(r.mediaMensual).toBe(40); // (90 + 0 + 30) / 3
  });

  it('el primer mes de uso no tiene con qué compararse', () => {
    const r = ritmoDeCompras([t('2026-10-03', 25)], HOY);
    expect(r.habitualHastaHoy).toBeNull();
    expect(r.mediaMensual).toBeNull();
    expect(r.barras).toHaveLength(1);
  });

  it('sin tickets, el mes actual en cero y sin comparación', () => {
    const r = ritmoDeCompras([], HOY);
    expect(r).toMatchObject({ actual: 0, comprasActual: 0, habitualHastaHoy: null });
    expect(r.barras).toEqual([{ key: '2026-10', etiqueta: 'oct', total: 0, actual: true }]);
  });

  it('lo que queda fuera de la ventana no cuenta', () => {
    const r = ritmoDeCompras([t('2025-12-01', 999), t('2026-10-01', 5)], HOY, 3);
    expect(r.barras.map((b) => b.key)).toEqual(['2026-10']);
    expect(r.mediaMensual).toBeNull();
  });

  it('la ventana cruza el cambio de año', () => {
    const r = ritmoDeCompras([t('2025-12-05', 20), t('2026-01-05', 30)], { year: 2026, month: 1, day: 20 }, 3);
    expect(r.barras.map((b) => b.etiqueta)).toEqual(['dic', 'ene']);
    expect(r.habitualHastaHoy).toBe(20);
  });
});
