/**
 * last-purchase.ts — el precio que sale debajo de la foto de cada producto.
 *
 * `products.last_purchase_price` es «lo que pagaste la última vez», y lo
 * escribían CINCO sitios con CUATRO reglas distintas:
 *
 *  - Cerrar la compra en Súper no lo escribía nunca. 33 de los 35 productos que
 *    el usuario había comprado con precio salían sin él en la tarjeta.
 *  - Anotar una compra a mano lo pisaba siempre —incluso con un precio vacío— y
 *    le ponía de fecha «ahora» en vez de la de la compra.
 *  - Los tickets solo lo movían hacia delante, y solo si eran de súper.
 *
 * Por eso «unos productos tienen precio y otros no» no tenía un motivo que se
 * pudiera explicar. Ahora sale de un solo sitio y de la única fuente que no
 * miente: el historial de compras (`product_purchases`).
 */
import { sql } from './db';

/**
 * Pone a cada producto el precio y la fecha de su ÚLTIMA compra con precio.
 *
 * - «Última» es por la fecha de la compra, no por cuándo se anotó: un ticket
 *   atrasado no le quita el sitio a una compra más reciente.
 * - Solo cuentan las del súper. Lo que costó un plato en un restaurante no es
 *   el precio de despensa de nada, y enseñarlo envenenaría el comparador.
 * - Un producto sin ninguna compra con precio se queda como está. Borrarle el
 *   precio perdería un dato real, aunque su compra ya no esté en el historial.
 * - Solo se escribe lo que cambia, así que repetirlo no cuesta nada.
 *
 * `productIds` null repasa todos los productos del usuario.
 *
 * `quitarSiNoQueda`: para después de BORRAR compras. Ahí sí se sabe que el
 * precio de la tarjeta ya no existe, y si no queda ninguna otra compra con
 * precio, se quita en vez de dejarlo huérfano. Así nacieron los precios viejos
 * de ALL y Paprika: salían de tickets borrados que nadie recalculó.
 */
export async function refreshLastPurchase(
  userId: string,
  productIds: readonly string[] | null,
  { quitarSiNoQueda = false }: { quitarSiNoQueda?: boolean } = {},
): Promise<number> {
  const ids = productIds === null ? null : [...new Set(productIds)];
  if (ids !== null && ids.length === 0) return 0;

  if (quitarSiNoQueda && ids !== null) {
    await sql`
      UPDATE products p
         SET last_purchase_price = NULL,
             last_purchase_date  = NULL
       WHERE p.id = ANY(${ids}::uuid[])
         AND p.user_id = ${userId}::uuid
         AND p.last_purchase_price IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM product_purchases pp
           LEFT JOIN shopping_trips t ON t.id = pp.trip_id
           WHERE pp.product_id = p.id AND pp.user_id = ${userId}::uuid
             AND pp.unit_price > 0
             AND (pp.trip_id IS NULL OR COALESCE(t.kind, 'grocery') = 'grocery')
         )
    `;
  }

  const rows = await sql`
    UPDATE products p
       SET last_purchase_price = u.unit_price,
           last_purchase_date  = u.purchased_at
      FROM (
        SELECT DISTINCT ON (pp.product_id) pp.product_id, pp.unit_price, pp.purchased_at
        FROM product_purchases pp
        LEFT JOIN shopping_trips t ON t.id = pp.trip_id
        WHERE pp.user_id = ${userId}::uuid
          AND pp.unit_price > 0
          AND (pp.trip_id IS NULL OR COALESCE(t.kind, 'grocery') = 'grocery')
          AND (${ids}::uuid[] IS NULL OR pp.product_id = ANY(${ids}::uuid[]))
        ORDER BY pp.product_id, pp.purchased_at DESC, pp.created_at DESC
      ) u
     WHERE p.id = u.product_id
       AND p.user_id = ${userId}::uuid
       AND (p.last_purchase_price IS DISTINCT FROM u.unit_price
            OR p.last_purchase_date IS DISTINCT FROM u.purchased_at)
    RETURNING p.id
  `;
  return rows.length;
}

/** Usuarios ya repasados en este proceso. */
const repasados = new Set<string>();

/**
 * El repaso completo, una vez por usuario y arranque en frío.
 *
 * Recupera lo que las vías viejas dejaron sin precio o con uno desfasado, y
 * sigue sirviendo de red por si alguna vía nueva se olvida. Tras la primera
 * vez no escribe nada: `refreshLastPurchase` solo toca lo que cambia.
 */
export async function ensureLastPurchaseFresh(userId: string): Promise<void> {
  if (repasados.has(userId)) return;
  repasados.add(userId);
  try {
    await refreshLastPurchase(userId, null);
  } catch {
    // Que la lista de productos se pinte aunque esto falle; se reintenta en el
    // siguiente arranque.
    repasados.delete(userId);
  }
}
