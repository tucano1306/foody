import { cardTitle, ultimosDeLaTarjeta } from './card-payment';
import type { DebtKind } from './debt-engine';

/** Una fila de la papelera, tal como la devuelve `listarPapelera`. */
export interface DeudaEnPapelera {
  id: string;
  name: string;
  kind: DebtKind;
  issuer: string | null;
  accountLast4: string | null;
  cardGroup: string | null;
  balance: number;
  currency: string;
  /** ISO. null = archivada antes de que existiera la papelera (no se sabe cuándo). */
  deletedAt: string | null;
}

/** Lo que la pantalla enseña: una cuenta borrada, con todos los tramos del mismo gesto. */
export interface EntradaDePapelera {
  /**
   * La deuda que se manda a `/restore`. Cualquiera del gesto sirve: el
   * servidor trae con ella los demás tramos borrados a la vez.
   */
  id: string;
  /** Todas las del gesto, para quitarlas de la lista en cuanto vuelven. */
  ids: string[];
  titulo: string;
  kind: DebtKind;
  /** Para el sello de la cuenta (`ChipDeCuenta`). */
  ultimos: string | null;
  tramos: number;
  saldo: number;
  currency: string;
  deletedAt: string | null;
}

/**
 * Agrupa la papelera como el usuario la recuerda: «borré la BofA ···3650», no
 * «borré Compras 3650, Unlimited Cash 3650 y Saldo nuevo 3650».
 *
 * Se agrupa por tarjeta Y por fecha de borrado, la misma regla que usa
 * `restaurarDeLaPapelera`: si un tramo se borró el lunes y el resto de la
 * tarjeta el viernes, son dos entradas, y recuperar una no trae la otra. Así
 * lo que dice la pantalla es exactamente lo que va a volver.
 *
 * El orden de entrada se respeta (el servidor manda lo más reciente primero).
 */
export function agruparPapelera(filas: readonly DeudaEnPapelera[]): EntradaDePapelera[] {
  const grupos = new Map<string, DeudaEnPapelera[]>();
  for (const f of filas) {
    const clave = `${f.cardGroup ?? f.id}|${f.deletedAt ?? ''}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  return [...grupos.values()].map((tramos) => {
    const primera = tramos[0];
    const esTarjeta = tramos.length > 1;
    return {
      id: primera.id,
      ids: tramos.map((t) => t.id),
      // Un tramo solo se llama por su nombre: «Compras 3650» dice más que
      // «BofA ···3650» cuando la tarjeta sigue viva y solo se fue ese saldo.
      titulo: esTarjeta ? cardTitle(tramos) : primera.name,
      kind: primera.kind,
      ultimos: ultimosDeLaTarjeta(tramos),
      tramos: tramos.length,
      saldo: Math.round(tramos.reduce((s, t) => s + t.balance, 0) * 100) / 100,
      currency: primera.currency,
      deletedAt: primera.deletedAt,
    };
  });
}

/** «hoy», «ayer», «hace 5 días», «el 3 oct»: cuándo se borró, dicho corto. */
export function cuandoSeBorro(deletedAt: string | null, ahora: Date = new Date()): string | null {
  if (!deletedAt) return null;
  const fecha = new Date(deletedAt);
  if (Number.isNaN(fecha.getTime())) return null;
  // Por días de calendario del dispositivo, no por bloques de 24 h: algo
  // borrado anoche a las 23:00 es «ayer» a las 8:00 de hoy.
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(fecha)) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return `el ${fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')}`;
}
