/**
 * trip-splits.ts — un ticket, varios tipos de gasto.
 *
 * Hasta ahora un ticket entero era de UN tipo: o súper, o farmacia, o comida
 * fuera. Pero un carrito de Walmart lleva la despensa de la semana y, en el
 * mismo recibo, las medicinas y una extensión de cable. Obligar a elegir uno
 * solo rompe las dos puntas: si se marca súper, el presupuesto de despensa se
 * infla con lo que no es comida; si se marca otro, la despensa entera
 * desaparece de Compras y de las estadísticas de precios.
 *
 * La regla, entera, en una línea:
 *
 *     el ticket declara su tipo principal; cada `split` recorta del total la
 *     parte que pertenece a otro sitio; LO QUE SOBRA se queda en el principal.
 *
 * Se modela así —y no con un tipo por línea de producto— porque las líneas
 * vinculadas son productos de la despensa por definición: lo que no es
 * despensa casi nunca tiene un producto que vincular (una consulta médica, un
 * bidón de aceite), así que lo que hay que capturar es un importe, no una
 * línea.
 *
 * Módulo PURO: sin SQL, sin React. Se prueba en trip-splits.test.ts.
 */
import { normalizeExpenseKind, type ExpenseKind } from './expense-kind';

export interface TripSplitInput {
  kind: ExpenseKind;
  amount: number;
  note?: string | null;
}

/** Cuánto va a cada tipo de gasto, ya sumado. */
export interface KindAmount {
  kind: ExpenseKind;
  amount: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safe(n: unknown): number {
  const v = typeof n === 'number' ? n : Number.parseFloat(String(n ?? ''));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Deja la lista en algo con lo que se pueda operar.
 *
 * Descarta los importes que no son dinero (0, negativos, basura) en vez de
 * guardarlos a cero: una fila de $0 en el ticket no dice nada y ensucia el
 * detalle para siempre.
 */
export function normalizeSplits(splits: readonly TripSplitInput[] | null | undefined): TripSplitInput[] {
  if (!Array.isArray(splits)) return [];
  return splits
    .map((s) => ({
      kind: normalizeExpenseKind(s?.kind),
      amount: round2(safe(s?.amount)),
      note: typeof s?.note === 'string' && s.note.trim() !== '' ? s.note.trim() : null,
    }))
    .filter((s) => s.amount > 0);
}

/** Lo que se ha repartido a otros tipos. */
export function splitsTotal(splits: readonly TripSplitInput[] | null | undefined): number {
  return round2(normalizeSplits(splits).reduce((sum, s) => sum + s.amount, 0));
}

/**
 * Lo que queda para el tipo principal del ticket.
 *
 * Nunca negativo: si alguien reparte más de lo que costó el ticket, el
 * resultado es 0 y `validateSplits` lo explica. Devolver un negativo dejaría
 * que un ticket restara del gasto del mes.
 */
export function remainderFor(total: number, splits: readonly TripSplitInput[] | null | undefined): number {
  return round2(Math.max(0, safe(total) - splitsTotal(splits)));
}

/**
 * ¿Se puede guardar esto? Devuelve el motivo, o `null` si va bien.
 *
 * Repartir MÁS de lo que costó el ticket es el único error posible aquí, y es
 * fácil de cometer tecleando: se dice cuánto sobra en vez de un «datos
 * inválidos» que obliga a rehacer la cuenta a mano.
 */
export function validateSplits(
  total: number,
  splits: readonly TripSplitInput[] | null | undefined,
): string | null {
  const repartido = splitsTotal(splits);
  const importe = round2(safe(total));
  if (repartido > importe) {
    return `Repartiste ${repartido.toFixed(2)} de un ticket de ${importe.toFixed(2)}: sobran ${round2(repartido - importe).toFixed(2)} sin sitio.`;
  }
  return null;
}

/**
 * Cuánto cuenta cada tipo de gasto en este ticket.
 *
 * Es la única función que necesita el resto de la app: la lista que sale de
 * aquí es exactamente lo que hay que sumar en el plan, en el presupuesto y en
 * las estadísticas.
 *
 * Los tipos repetidos se juntan —dos splits de farmacia son una farmacia— y el
 * principal desaparece de la lista cuando no le sobra nada, que es el caso de
 * un ticket repartido al céntimo.
 */
export function tripKindAmounts(
  kind: ExpenseKind,
  total: number,
  splits: readonly TripSplitInput[] | null | undefined,
): KindAmount[] {
  const porTipo = new Map<ExpenseKind, number>();

  const resto = remainderFor(total, splits);
  if (resto > 0) porTipo.set(normalizeExpenseKind(kind), resto);

  for (const s of normalizeSplits(splits)) {
    porTipo.set(s.kind, round2((porTipo.get(s.kind) ?? 0) + s.amount));
  }

  return [...porTipo].map(([k, amount]) => ({ kind: k, amount }));
}

/** Lo que este ticket aporta a un tipo concreto. */
export function amountForKind(
  target: ExpenseKind,
  kind: ExpenseKind,
  total: number,
  splits: readonly TripSplitInput[] | null | undefined,
): number {
  return tripKindAmounts(kind, total, splits).find((k) => k.kind === target)?.amount ?? 0;
}
