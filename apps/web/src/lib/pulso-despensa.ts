import type { Product } from '@foody/types';

/**
 * Cómo está la despensa, en los mismos cuatro montones que ve el usuario.
 *
 * Lo que ya va en el carrito (Modo Supermercado, compra sin cerrar) sale de
 * «a la mitad» y «se acabó» y cuenta aparte: ya está resuelto, y si siguiera
 * sumando en «por reponer», el número de Casa diría que faltan cosas que
 * llevas en la mano. Es la misma regla que esconde esos productos de las
 * secciones de urgencia.
 */
export interface PulsoDespensa {
  readonly tengo: number;
  readonly mitad: number;
  readonly acabado: number;
  readonly enCarrito: number;
  /** `mitad + acabado`: lo que todavía hay que ir a buscar. */
  readonly porReponer: number;
  readonly total: number;
}

export function pulsoDeDespensa(
  products: readonly Pick<Product, 'id' | 'stockLevel'>[],
  enCarrito: ReadonlySet<string>,
): PulsoDespensa {
  let tengo = 0;
  let mitad = 0;
  let acabado = 0;
  let carrito = 0;
  for (const p of products) {
    if (p.stockLevel === 'full') tengo++;
    else if (enCarrito.has(p.id)) carrito++;
    else if (p.stockLevel === 'half') mitad++;
    else acabado++;
  }
  return {
    tengo,
    mitad,
    acabado,
    enCarrito: carrito,
    porReponer: mitad + acabado,
    total: products.length,
  };
}
