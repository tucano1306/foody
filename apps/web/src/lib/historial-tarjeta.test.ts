import { describe, expect, it } from 'vitest';
import { historialDeLaTarjeta, type MovimientoDeTramo } from './historial-tarjeta';

function mov(id: string, over: Partial<MovimientoDeTramo>): MovimientoDeTramo {
  return { id, kind: 'charge', amount: 10, note: null, occurredAt: '2026-11-01T15:00:00.000Z', ...over };
}

describe('historialDeLaTarjeta — los libros de cada tramo en una sola lista', () => {
  it('un abono a la tarjeta repartido en dos tramos es UNA línea por el total', () => {
    const lineas = historialDeLaTarjeta([
      {
        tramo: 'Compras',
        movimientos: [mov('a', { kind: 'payment', amount: 100, occurredAt: '2026-11-05T15:00:00.120Z', note: 'Abono de $156.00 a la tarjeta: $100.00 del mínimo' })],
      },
      {
        tramo: 'Adelanto',
        movimientos: [mov('b', { kind: 'payment', amount: 56, occurredAt: '2026-11-05T15:00:00.480Z', note: 'Abono de $156.00 a la tarjeta: $56.00 del mínimo' })],
      },
    ]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ kind: 'payment', amount: 156, aLaTarjeta: true, note: null });
    expect(lineas[0].partes).toEqual([
      { tramo: 'Compras', amount: 100 },
      { tramo: 'Adelanto', amount: 56 },
    ]);
  });

  it('la nota del usuario sale de la del reparto', () => {
    const [linea] = historialDeLaTarjeta([
      { tramo: 'Compras', movimientos: [mov('a', { kind: 'payment', amount: 40, note: 'Abono de $40.00 a la tarjeta: $40.00 del mínimo · quincena' })] },
    ]);
    expect(linea.note).toBe('quincena');
  });

  it('dos abonos iguales en días distintos no se juntan', () => {
    const nota = 'Abono de $50.00 a la tarjeta: $50.00 del mínimo';
    const lineas = historialDeLaTarjeta([
      {
        tramo: 'Compras',
        movimientos: [
          mov('a', { kind: 'payment', amount: 50, note: nota, occurredAt: '2026-11-05T15:00:00Z' }),
          mov('b', { kind: 'payment', amount: 50, note: nota, occurredAt: '2026-10-05T15:00:00Z' }),
        ],
      },
    ]);
    expect(lineas.map((l) => l.amount)).toEqual([50, 50]);
  });

  it('dos abonos seguidos al MISMO tramo son dos líneas, aunque caigan en la ventana', () => {
    const nota = 'Abono de $20.00 a la tarjeta: $20.00 del mínimo';
    const lineas = historialDeLaTarjeta([
      {
        tramo: 'Compras',
        movimientos: [
          mov('a', { kind: 'payment', amount: 20, note: nota, occurredAt: '2026-11-05T15:00:00Z' }),
          mov('b', { kind: 'payment', amount: 20, note: nota, occurredAt: '2026-11-05T15:00:30Z' }),
        ],
      },
    ]);
    expect(lineas).toHaveLength(2);
  });

  it('lo demás va suelto, con su tramo, del más reciente al más viejo', () => {
    const lineas = historialDeLaTarjeta([
      { tramo: 'Compras', movimientos: [mov('c1', { kind: 'charge', amount: 30, occurredAt: '2026-11-02T10:00:00Z' })] },
      {
        tramo: 'Saldo nuevo',
        movimientos: [
          mov('i1', { kind: 'interest', amount: 11.06, occurredAt: '2026-11-03T10:00:00Z' }),
          mov('p1', { kind: 'payment', amount: 25, note: 'pagué en el banco', occurredAt: '2026-11-01T10:00:00Z' }),
        ],
      },
    ]);
    expect(lineas.map((l) => [l.id, l.partes[0].tramo, l.aLaTarjeta])).toEqual([
      ['i1', 'Saldo nuevo', false],
      ['c1', 'Compras', false],
      ['p1', 'Saldo nuevo', false],
    ]);
    expect(lineas[2].note).toBe('pagué en el banco');
  });

  it('los montos salen en positivo y con centavos exactos', () => {
    const [linea] = historialDeLaTarjeta([
      { tramo: 'Compras', movimientos: [mov('x', { kind: 'adjustment', amount: -12.345 })] },
    ]);
    expect(linea.amount).toBe(12.35);
  });

  it('corta en el límite y descarta fechas que no se pueden leer', () => {
    const movimientos = Array.from({ length: 10 }, (_, i) =>
      mov(`m${i}`, { occurredAt: `2026-11-${String(i + 1).padStart(2, '0')}T10:00:00Z` }),
    );
    const lineas = historialDeLaTarjeta([{ tramo: 'Compras', movimientos: [...movimientos, mov('roto', { occurredAt: 'ayer' })] }], 3);
    expect(lineas.map((l) => l.id)).toEqual(['m9', 'm8', 'm7']);
  });

  it('sin movimientos, lista vacía', () => {
    expect(historialDeLaTarjeta([{ tramo: 'Compras', movimientos: [] }])).toEqual([]);
  });
});
