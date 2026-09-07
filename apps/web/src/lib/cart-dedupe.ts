/**
 * cart-dedupe.ts — un producto, una compra por ticket.
 *
 * Al completar la compra se inserta una fila de `product_purchases` por cada
 * fila del carrito, pero el precio y la cantidad se buscan por `product_id`.
 * Con el mismo producto dos veces en la lista salían dos compras IDÉNTICAS:
 * un ticket de Publix quedó con el jamón y el queso duplicados, sumando $36.56
 * en líneas sobre un recibo de $20.68, y ese artículo pasó a figurar comprado
 * el doble de veces en «Más comprados» y en el histórico de precios.
 *
 * La causa estaba en la base —seis sitios decían `ON CONFLICT DO NOTHING` sin
 * que existiera la restricción única que hace falta para que eso signifique
 * algo— y ahí se arregló. Esto es el cinturón: aunque una base vieja no tenga
 * el índice, o dos pestañas escriban a la vez, de aquí no sale un producto
 * repetido.
 */

/**
 * Se queda con la PRIMERA aparición de cada producto, en orden.
 *
 * La primera y no la última a propósito: la limpieza que se hizo en la base
 * conservó la fila más antigua de cada producto, y las dos reglas tienen que
 * decir lo mismo o el resultado dependería de por dónde pasó el dato.
 *
 * `new Map(entradas)` se queda con la ÚLTIMA clave repetida, que es lo
 * contrario de lo que hace falta.
 */
export function dedupeByProduct<T extends { product_id: string }>(rows: readonly T[]): T[] {
  const vistos = new Map<string, T>();
  for (const r of rows) if (!vistos.has(r.product_id)) vistos.set(r.product_id, r);
  return [...vistos.values()];
}
