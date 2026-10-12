/**
 * mapeo.ts — cómo se ve un gasto de Foody en Computo.
 *
 * Las categorías son las que el usuario YA usaba en Computo cuando metía los
 * gastos a mano (Supermercado, Restaurante, Gasolina, Otros gastos…), para que
 * lo que llega solo se sume a lo que ya había en vez de abrir líneas nuevas en
 * el estado de resultados. Farmacia y Hogar no existían: se crean con el mismo
 * nombre que tienen en Foody.
 *
 * La categoría solo se pone al CREAR el gasto en Computo; si allí se cambia,
 * Foody no la vuelve a tocar.
 *
 * Módulo PURO. Se prueba en mapeo.test.ts.
 */
import type { ExpenseKind } from '../expense-kind';
import { expenseKindMeta, normalizeExpenseKind } from '../expense-kind';
import { aCampoDeFecha } from '../app-time';

export interface GastoComputo {
  /** Identidad estable del gasto en Foody: `trip:<id>:<tipo>` o `payment:<id>`. */
  readonly ref: string;
  /** El día del gasto, YYYY-MM-DD, en la hora de Miami. */
  readonly fecha: string;
  readonly monto: number;
  readonly categoria: string;
  readonly descripcion: string;
  readonly notas?: string;
}

export const CATEGORIA_DE_TICKET: Readonly<Record<ExpenseKind, string>> = {
  grocery: 'Supermercado',
  dining: 'Restaurante',
  fuel: 'Gasolina',
  pharmacy: 'Farmacia',
  home: 'Hogar y ferretería',
  other: 'Otros gastos',
};

/** Las categorías de los recibos de Pagos (PaymentForm.tsx). */
export const CATEGORIA_DE_PAGO: Readonly<Record<string, string>> = {
  utilities: 'Servicios Públicos',
  rent: 'Vivienda',
  internet: 'Internet y teléfono',
  phone: 'Internet y teléfono',
  streaming: 'Suscripciones',
  subscriptions: 'Suscripciones',
  insurance: 'Seguros',
  other: 'Otros gastos',
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function categoriaDePago(category: string | null | undefined): string {
  return CATEGORIA_DE_PAGO[category ?? ''] ?? 'Otros gastos';
}

/** Una fila de `trip_kind_amounts`: lo que un ticket aporta a un tipo de gasto. */
export interface TramoDeTicket {
  readonly tripId: string;
  readonly kind: string;
  readonly tripKind: string;
  readonly amount: number;
  /** ISO de `shopping_trips.date`. */
  readonly date: string;
  readonly storeName: string | null;
}

/**
 * Un ticket es UN gasto por tipo: un Publix con $21.94 de farmacia son dos
 * gastos en Computo —$13.77 en Supermercado y $21.94 en Farmacia—, igual que
 * los cuenta el Plan financiero.
 */
export function gastoDeTicket(t: TramoDeTicket): GastoComputo {
  const kind = normalizeExpenseKind(t.kind);
  const partido = normalizeExpenseKind(t.tripKind) !== kind;
  return {
    ref: `trip:${t.tripId}:${kind}`,
    fecha: aCampoDeFecha(t.date),
    monto: round2(t.amount),
    categoria: CATEGORIA_DE_TICKET[kind],
    descripcion: t.storeName?.trim() || expenseKindMeta(kind).groupLabel,
    notas: partido
      ? `Desde Foody · parte de un ticket de ${expenseKindMeta(normalizeExpenseKind(t.tripKind)).groupLabel}`
      : 'Desde Foody · Compras',
  };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Un recibo pagado en Pagos: su nombre, lo que se pagó de verdad y el mes que cubre. */
export interface PagoRegistrado {
  readonly recordId: string;
  readonly paidAt: string;
  readonly monto: number;
  readonly nombre: string;
  readonly category: string | null;
  readonly month: number;
  readonly year: number;
}

export function gastoDePago(p: PagoRegistrado): GastoComputo {
  return {
    ref: `payment:${p.recordId}`,
    fecha: aCampoDeFecha(p.paidAt),
    monto: round2(p.monto),
    categoria: categoriaDePago(p.category),
    descripcion: p.nombre.trim() || 'Pago',
    notas: `Desde Foody · Pagos · ${MESES[p.month - 1] ?? p.month} ${p.year}`,
  };
}

/**
 * La huella de un gasto: si no cambia, no hay nada que mandar.
 *
 * Lleva todo lo que Computo guarda. Que cambie la categoría también reenvía el
 * gasto, aunque Computo no la toque: es barato y deja la regla en un solo
 * sitio, el receptor.
 */
export function huella(g: GastoComputo): string {
  return JSON.stringify([g.fecha, g.monto.toFixed(2), g.categoria, g.descripcion, g.notas ?? '']);
}
