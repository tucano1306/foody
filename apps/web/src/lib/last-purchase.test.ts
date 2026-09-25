import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Un guardián, no una prueba de comportamiento.
 *
 * El precio que sale debajo de la foto (`products.last_purchase_price`) lo
 * escribían CINCO sitios con CUATRO reglas: cerrar la compra en Súper no lo
 * escribía nunca —33 productos comprados con precio salían sin él—, anotar una
 * compra a mano lo pisaba siempre, y los tickets solo lo movían hacia delante.
 * Borrar un ticket no lo recalculaba y dejaba precios de compras que ya no
 * existían (ALL, Paprika).
 *
 * Ahora solo lo escribe `refreshLastPurchase`, que lo saca del historial de
 * compras. Esta prueba impide que otra vía vuelva a escribirlo por su cuenta.
 * El SQL se comprobó contra la base real en una transacción deshecha (ver PR):
 * 33 → 68 productos con precio, idempotente, y borrar un ticket devuelve el
 * precio a la compra anterior.
 */

const RAIZ = join(__dirname, '..');

function fuentes(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) fuentes(ruta, out);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/** Una ASIGNACIÓN en SQL, no una lectura: `last_purchase_price = ${…}` o `= NULL`. */
const ESCRIBE_EL_PRECIO = /last_purchase_price\s*=\s*(\$\{|NULL|u\.)/i;

describe('el precio de la tarjeta se escribe en un solo sitio', () => {
  it('solo last-purchase.ts escribe last_purchase_price', () => {
    const culpables = fuentes(RAIZ)
      .filter((f) => ESCRIBE_EL_PRECIO.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(RAIZ.length + 1).replace(/\\/g, '/'));

    expect(
      culpables,
      'Para cambiar el precio de la tarjeta usa refreshLastPurchase() de ' +
        'lib/last-purchase.ts: sale del historial de compras con una sola regla.',
    ).toEqual(['lib/last-purchase.ts']);
  });

  it('las vías que crean o borran compras lo recalculan', () => {
    const vias = [
      'app/api/shopping-list/complete/route.ts',
      'app/api/shopping-trips/route.ts',
      'app/api/shopping-trips/[id]/route.ts',
      'app/api/products/[id]/purchases/route.ts',
      'app/api/product-purchases/[id]/route.ts',
    ];
    for (const via of vias) {
      expect(readFileSync(join(RAIZ, via), 'utf8'), via).toContain('refreshLastPurchase(');
    }
  });
});
