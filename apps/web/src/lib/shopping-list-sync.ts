/**
 * shopping-list-sync.ts — que Casa y Súper cuenten lo mismo.
 *
 * Casa cuenta los faltantes mirando el stock de cada producto (`stock_level`
 * `empty` o `half`). Súper enseña las filas de `shopping_list_items`. Son dos
 * sitios para un mismo hecho, y se separaron: Casa decía 6 faltantes y Súper
 * enseñaba 4.
 *
 * La regla de julio (PR #36) cubría una sola dirección: un producto LLENO no
 * sale en Súper aunque le quede una fila vieja. La contraria —un producto que
 * falta SIEMPRE sale— nunca se aseguró, y había al menos una vía para romperla:
 * «No estaba en el súper — quitar de la lista» borraba la fila y dejaba el
 * producto como faltante. Casa lo seguía contando; Súper no volvía a verlo.
 *
 * Aquí viven las dos piezas que cierran esa dirección:
 *
 *  - `syncFaltantesToList`: al cargar la lista, todo faltante sin fila la
 *    recibe. Arregla también la desincronización que llegue por cualquier otro
 *    camino, no solo la de quitar de la lista.
 *  - `SKIP_HOURS`: cuánto dura «apartado» un producto que no estaba en el súper
 *    si nadie cierra la compra. Cerrarla lo devuelve antes.
 */
import { sql } from './db';
import { ensureListSkipSchema } from './ensure-schema';

/**
 * Tope de lo que dura un «No estaba en el súper».
 *
 * Lo normal es que vuelva al cerrar la compra. Esto es para cuando no se
 * cierra: una compra no dura doce horas, y la siguiente suele ser otro día.
 */
export const SKIP_HOURS = 12;

/**
 * Da fila en la lista a cada faltante que no la tenga.
 *
 * «Faltante» es exactamente lo que cuenta Casa: `stock_level` `empty` o `half`,
 * de mis productos y de los que mi hogar comparte conmigo (la misma
 * visibilidad que `api.products.list`). Si aquí se usara otra definición, las
 * dos pantallas volverían a discrepar.
 *
 * No toca las filas que ya existen, y eso incluye las apartadas: un producto
 * apartado tiene fila, así que no se le crea otra y sigue fuera hasta que toque.
 *
 * Escribe al leer, y es a propósito: es idempotente, solo inserta lo que falta,
 * y es el único punto por el que pasan todas las vías que pueden desincronizar.
 */
export async function syncFaltantesToList(userId: string, householdId: string | null): Promise<void> {
  await ensureListSkipSchema();
  await sql`
    INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
    SELECT gen_random_uuid(), p.id, ${userId}::uuid, NULL, NOW(), NOW()
    FROM products p
    WHERE (
            p.user_id = ${userId}::uuid
         OR (${householdId}::uuid IS NOT NULL
             AND p.household_id = ${householdId}::uuid
             AND p.is_private = false)
          )
      AND p.stock_level IN ('empty', 'half')
      AND NOT EXISTS (
        SELECT 1 FROM shopping_list_items s
        WHERE s.user_id = ${userId}::uuid AND s.product_id = p.id
      )
    ON CONFLICT (user_id, product_id) DO NOTHING
  `;
}
