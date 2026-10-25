/**
 * precios-compra.ts — el precio de cada producto al cerrar la compra en el
 * súper, y DE DÓNDE sale.
 *
 * Hay tres orígenes y no valen lo mismo:
 *
 *   manual      lo que el usuario tecleó en la calculadora del súper
 *   last_price  sin precio tecleado: el de la última compra del producto
 *   allocated   ni lo uno ni lo otro: su parte de lo que queda del total
 *
 * Antes los tres se guardaban como `shopping_list`, y editar el ticket los
 * trataba todos como estimados: el formulario dejaba vacíos hasta los precios
 * tecleados y el servidor repartía el total entre las unidades. El 21 oct 2026
 * un Walmart de $111.69 acabó con veinte productos a $2.25 y las estadísticas
 * se lo creyeron. Con el origen guardado, lo tecleado sobrevive a una edición
 * y solo lo repartido se vuelve a repartir.
 *
 * Módulo PURO. Se prueba en precios-compra.test.ts.
 */

export type OrigenPrecio = 'manual' | 'last_price' | 'allocated';

export interface PrecioResuelto {
  /** Precio por unidad, o `null` si no hay forma de saberlo. */
  readonly unitPrice: number | null;
  readonly source: OrigenPrecio | 'unknown';
}

export interface LineaDeCompra {
  readonly productId: string;
  readonly quantity: number;
}

export function resolverPreciosDeCompra(args: {
  readonly lineas: readonly LineaDeCompra[];
  /** Lo tecleado en el súper, por producto. Lo que no sea un número > 0 se ignora. */
  readonly tecleados: Readonly<Record<string, unknown>>;
  /** `products.last_purchase_price`, por producto. */
  readonly ultimos: Readonly<Record<string, number | null | undefined>>;
  /** El total del ticket que escribió el usuario, si lo escribió. */
  readonly totalTicket: number | null;
}): Record<string, PrecioResuelto> {
  const { lineas, tecleados, ultimos, totalTicket } = args;
  const out: Record<string, PrecioResuelto> = {};

  for (const l of lineas) {
    const tecleado = tecleados[l.productId];
    const ultimo = ultimos[l.productId];
    if (typeof tecleado === 'number' && Number.isFinite(tecleado) && tecleado > 0) {
      out[l.productId] = { unitPrice: tecleado, source: 'manual' };
    } else if (typeof ultimo === 'number' && Number.isFinite(ultimo) && ultimo > 0) {
      out[l.productId] = { unitPrice: ultimo, source: 'last_price' };
    } else {
      out[l.productId] = { unitPrice: null, source: 'unknown' };
    }
  }

  // Lo que el ticket costó y no explica ningún precio se reparte entre los
  // productos sin precio, por unidades: así las estadísticas no ven $0.
  if (totalTicket !== null && totalTicket > 0) {
    const conocido = lineas.reduce((s, l) => {
      const p = out[l.productId].unitPrice;
      return p === null ? s : s + p * l.quantity;
    }, 0);
    const resto = totalTicket - conocido;
    const unidadesSinPrecio = lineas.reduce((s, l) => (out[l.productId].unitPrice === null ? s + l.quantity : s), 0);
    if (resto > 0 && unidadesSinPrecio > 0) {
      const porUnidad = resto / unidadesSinPrecio;
      for (const l of lineas) {
        if (out[l.productId].unitPrice === null) out[l.productId] = { unitPrice: porUnidad, source: 'allocated' };
      }
    }
  }

  return out;
}

/**
 * ¿Este precio guardado lo conserva una edición del ticket?
 *
 * Todo menos lo repartido y lo desconocido. `shopping_list` es el origen de
 * los tickets de antes de existir esta distinción: ahí solían ir los precios
 * tecleados, así que se conservan antes que tirarlos.
 */
export function precioSeConserva(source: string | null | undefined): boolean {
  return source !== 'allocated' && source !== 'unknown' && source != null;
}
