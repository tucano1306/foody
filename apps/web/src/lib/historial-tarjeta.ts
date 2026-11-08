import type { MovementKind } from './debt-engine';

/** Lo que hace falta de un movimiento para el historial de la tarjeta. */
export interface MovimientoDeTramo {
  readonly id: string;
  readonly kind: MovementKind;
  readonly amount: number;
  readonly note: string | null;
  readonly occurredAt: string;
}

export interface ParteDeLinea {
  readonly tramo: string;
  readonly amount: number;
}

/** Una línea del historial: un movimiento suelto o un abono a la tarjeta entera. */
export interface LineaDelHistorial {
  readonly id: string;
  readonly kind: MovementKind;
  /** Siempre en positivo: el signo lo pone el tipo de movimiento. */
  readonly amount: number;
  readonly occurredAt: string;
  readonly note: string | null;
  /** Un abono a la tarjeta, repartido entre sus tramos por el banco. */
  readonly aLaTarjeta: boolean;
  /** A qué saldo fue cada parte. Una línea suelta tiene una sola. */
  readonly partes: readonly ParteDeLinea[];
}

/**
 * La nota que `registerCardPayment` le pone a cada parte de un abono a la
 * tarjeta: «Abono de $156.00 a la tarjeta: $100.00 del mínimo · nota».
 */
const ABONO_A_TARJETA = /^Abono de \$(\d+(?:\.\d+)?) a la tarjeta:[^·]*(?:·\s*(.*))?$/;

/**
 * Dos partes del mismo abono se asientan una tras otra, con unos milisegundos
 * de diferencia (o con la misma fecha, si se eligió). Dos minutos sobra para
 * juntarlas y no alcanza para confundir dos abonos de verdad.
 */
const VENTANA_MS = 2 * 60 * 1000;

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * El historial de una tarjeta con tramos, en una sola lista.
 *
 * Cada tramo tiene su libro mayor y un abono a la tarjeta se asienta en
 * trozos, uno por tramo. Leídos tal cual, un pago de $156 salía como dos
 * líneas de $100 y $56 que no se parecían a nada del estado de cuenta. Aquí
 * esos trozos vuelven a ser UN abono por el total, y debajo se ve a qué saldo
 * fue cada parte. Lo demás (consumos, intereses, abonos hechos a un tramo
 * concreto) va suelto, con el nombre de su tramo.
 */
export function historialDeLaTarjeta(
  libros: readonly { readonly tramo: string; readonly movimientos: readonly MovimientoDeTramo[] }[],
  limite = 30,
): LineaDelHistorial[] {
  const todos = libros
    .flatMap((l) => l.movimientos.map((m) => ({ ...m, tramo: l.tramo, t: Date.parse(m.occurredAt) })))
    .filter((m) => Number.isFinite(m.t))
    .sort((a, b) => b.t - a.t);

  type Grupo = { id: string; kind: MovementKind; t: number; occurredAt: string; note: string | null; total: number | null; partes: ParteDeLinea[] };
  const grupos: Grupo[] = [];

  for (const m of todos) {
    const abono = m.kind === 'payment' && m.note ? ABONO_A_TARJETA.exec(m.note) : null;
    if (abono) {
      const total = Number(abono[1]);
      const nota = abono[2]?.trim() || null;
      const mismo = grupos.find(
        (g) =>
          g.total === total &&
          g.note === nota &&
          Math.abs(g.t - m.t) <= VENTANA_MS &&
          !g.partes.some((p) => p.tramo === m.tramo),
      );
      if (mismo) {
        mismo.partes.push({ tramo: m.tramo, amount: centavos(Math.abs(m.amount)) });
        continue;
      }
      grupos.push({ id: m.id, kind: m.kind, t: m.t, occurredAt: m.occurredAt, note: nota, total, partes: [{ tramo: m.tramo, amount: centavos(Math.abs(m.amount)) }] });
      continue;
    }
    grupos.push({ id: m.id, kind: m.kind, t: m.t, occurredAt: m.occurredAt, note: m.note, total: null, partes: [{ tramo: m.tramo, amount: centavos(Math.abs(m.amount)) }] });
  }

  return grupos.slice(0, limite).map((g) => ({
    id: g.id,
    kind: g.kind,
    // La suma de lo que de verdad se asentó, no el total de la nota: si una
    // parte no llegó a guardarse, la línea no promete un dinero que no está.
    amount: centavos(g.partes.reduce((s, p) => s + p.amount, 0)),
    occurredAt: g.occurredAt,
    note: g.note,
    aLaTarjeta: g.total !== null,
    partes: [...g.partes].sort((a, b) => b.amount - a.amount),
  }));
}
