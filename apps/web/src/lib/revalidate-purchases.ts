import { revalidatePath } from 'next/cache';

/**
 * revalidate-purchases.ts — avisar a las pantallas que una compra las cambió.
 *
 * Una compra no solo se guarda: cambia lo que dicen OTRAS pantallas. «Más
 * comprados» en Casa, los totales de Compras, las estadísticas, el presupuesto
 * y el stock de la despensa se calculan todos a partir de las mismas filas de
 * `product_purchases`.
 *
 * El problema era que nadie se lo decía. `router.refresh()` refresca la
 * pantalla en la que estás, así que al terminar una compra en Modo Supermercado
 * se refrescaba el súper —y Casa seguía mostrando el «Más comprados» de antes
 * hasta que la caché de rutas del cliente caducara o el usuario recargara a
 * mano. Se veía exactamente como si la estadística no se actualizara nunca.
 *
 * `revalidatePath` tira esas entradas de la caché, así que la siguiente vez que
 * se entra a cualquiera de esas pantallas se vuelve a calcular con la compra ya
 * dentro.
 */

/**
 * Pantallas cuyo contenido se deriva de las compras.
 *
 * Se enumeran a mano y no se invalida la app entera porque tirar la caché de
 * todo obligaría a volver a renderizar pantallas que no cambian con una compra
 * (Pagos, Deudas, Hogar), y eso son consultas de más contra la base en cada
 * ticket.
 */
const PATHS_DERIVED_FROM_PURCHASES = [
  '/home',
  '/shopping-trips',
  '/stats',
  '/budget',
  '/plan',
  '/products',
] as const;

/**
 * Marca como caducadas las pantallas que dependen de las compras.
 *
 * Nunca lanza: si la revalidación falla, la compra YA está guardada, y hacer
 * que la petición devuelva error por esto le diría al usuario que no se guardó
 * algo que sí se guardó. Lo peor que pasa es ver una cifra vieja un rato más.
 */
export function revalidateAfterPurchase(): void {
  for (const path of PATHS_DERIVED_FROM_PURCHASES) {
    try {
      revalidatePath(path);
    } catch {
      // Una caché terca no puede tumbar una compra buena.
    }
  }
}
