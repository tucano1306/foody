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
 * Lo de NEGOCIO (`business_share` del ticket o del pago) no va a la empresa
 * personal: sale con `destino: 'negocio'` y Computo lo apunta en la empresa de
 * negocio, en su módulo de Gastos y con la categoría que el usuario usa allí.
 * Un gasto mixto se parte en dos.
 *
 * Módulo PURO. Se prueba en mapeo.test.ts.
 */
import type { ExpenseKind } from '../expense-kind';
import { expenseKindMeta, normalizeExpenseKind } from '../expense-kind';
import { aCampoDeFecha } from '../app-time';

export type DestinoComputo = 'personal' | 'negocio';

export interface GastoComputo {
  /**
   * Identidad estable del gasto en Foody: `trip:<id>:<tipo>` o `payment:<id>`,
   * con `:negocio` al final para la parte de negocio.
   */
  readonly ref: string;
  /** El día del gasto, YYYY-MM-DD, en la hora de Miami. */
  readonly fecha: string;
  readonly monto: number;
  readonly categoria: string;
  readonly descripcion: string;
  readonly notas?: string;
  /** En qué empresa de Computo entra: la personal o la de negocio. */
  readonly destino: DestinoComputo;
}

const SUFIJO_NEGOCIO = ':negocio';

/** El destino va en la ref: así un borrado, que solo guarda la ref, sabe adónde ir. */
export function destinoDeRef(ref: string): DestinoComputo {
  return ref.endsWith(SUFIJO_NEGOCIO) ? 'negocio' : 'personal';
}

/**
 * Parte un gasto según su porcentaje de negocio. Al 0 % es el mismo gasto,
 * personal; al 100 %, el mismo, de negocio (con su ref); en medio, dos gastos
 * que suman exactamente el original (el redondeo se lo queda la parte
 * personal).
 */
export function repartirPorNegocio(g: GastoComputo, porcentajeNegocio: number | null | undefined): GastoComputo[] {
  const pct = Math.min(100, Math.max(0, Number(porcentajeNegocio) || 0));
  const negocio = round2((g.monto * pct) / 100);
  const personal = round2(g.monto - negocio);
  const partido = negocio > 0 && personal > 0;
  const partes: GastoComputo[] = [];
  if (personal > 0) {
    partes.push({
      ...g,
      monto: personal,
      destino: 'personal',
      notas: partido ? `${g.notas ?? 'Desde Foody'} · parte personal (${100 - pct} %)` : g.notas,
    });
  }
  if (negocio > 0) {
    partes.push({
      ...g,
      ref: `${g.ref}${SUFIJO_NEGOCIO}`,
      monto: negocio,
      destino: 'negocio',
      notas: partido ? `${g.notas ?? 'Desde Foody'} · parte de negocio (${pct} %)` : g.notas,
    });
  }
  return partes;
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
  /** `shopping_trips.business_share`, 0–100. */
  readonly businessShare?: number;
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
    destino: 'personal',
  };
}

/** El tramo del ticket ya repartido entre lo personal y lo de negocio: lo que se manda. */
export function gastosDeTicket(t: TramoDeTicket): GastoComputo[] {
  return repartirPorNegocio(gastoDeTicket(t), t.businessShare);
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
  /** `monthly_payments.business_share`, 0–100. */
  readonly businessShare?: number;
}

export function gastoDePago(p: PagoRegistrado): GastoComputo {
  return {
    ref: `payment:${p.recordId}`,
    fecha: aCampoDeFecha(p.paidAt),
    monto: round2(p.monto),
    categoria: categoriaDePago(p.category),
    descripcion: p.nombre.trim() || 'Pago',
    notas: `Desde Foody · Pagos · ${MESES[p.month - 1] ?? p.month} ${p.year}`,
    destino: 'personal',
  };
}

/** El pago ya repartido entre lo personal y lo de negocio: lo que se manda. */
export function gastosDePago(p: PagoRegistrado): GastoComputo[] {
  return repartirPorNegocio(gastoDePago(p), p.businessShare);
}

/**
 * La huella de un gasto: si no cambia, no hay nada que mandar.
 *
 * Lleva todo lo que Computo guarda. Que cambie la categoría también reenvía el
 * gasto, aunque Computo no la toque: es barato y deja la regla en un solo
 * sitio, el receptor.
 */
export function huella(g: GastoComputo): string {
  return JSON.stringify([g.fecha, g.monto.toFixed(2), g.categoria, g.descripcion, g.notas ?? '', g.destino]);
}
