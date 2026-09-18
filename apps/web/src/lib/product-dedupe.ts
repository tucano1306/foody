/**
 * product-dedupe.ts — decide cuándo dos fichas son el mismo producto.
 *
 * El catálogo acabó con diez pares repetidos («Aguacate» dos veces, «sal» dos
 * veces, «Aceite De Oliva» dos veces…). No es cosmético: `product_purchases`
 * cuelga de `product_id`, así que cada copia se lleva su trozo del historial y
 * el precio medio, la predicción de stock y las estadísticas de ese producto
 * salen partidos en dos sin que nada avise. Se limpiaron a mano el 18 sep 2026;
 * esto es para que no vuelva a pasar.
 *
 * La comparación ignora mayúsculas, acentos, puntuación y espacios de más
 * —«Atún», «atun» y «  ATUN » son la misma lata— reutilizando `normalizeName`,
 * que ya hace justo eso.
 *
 * Lo que NO hace es traducir: `canonicalName` uniría «Agua» con un producto
 * llamado «Water», y si alguien crea los dos a propósito, tiene derecho a
 * tenerlos separados. Aquí solo se juntan nombres que ya son el mismo nombre.
 */
import { normalizeName } from './receipt-match';

export interface NamedProduct {
  readonly id: string;
  readonly name: string;
}

/** La clave con la que dos nombres son «el mismo producto» para su dueño. */
export function productKey(name: string): string {
  return normalizeName(name);
}

/**
 * La ficha del catálogo que ya representa ese nombre, o null si es nuevo.
 *
 * Un nombre que se queda en nada al normalizar (solo signos, solo espacios) no
 * casa con nada: si no, la primera ficha de la lista se tragaría cualquier
 * creación con el nombre en blanco.
 */
export function findDuplicate<T extends NamedProduct>(
  name: string,
  existing: readonly T[],
): T | null {
  const clave = productKey(name);
  if (clave.length === 0) return null;
  return existing.find((p) => productKey(p.name) === clave) ?? null;
}
