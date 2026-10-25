import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensureListSkipSchema, ensurePurchaseSchema } from '@/lib/ensure-schema';
import { dedupeByProduct } from '@/lib/cart-dedupe';
import { revalidateAfterPurchase } from '@/lib/revalidate-purchases';
import { normalizeBrand } from '@/lib/product-brands';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';
import { refreshLastPurchase } from '@/lib/last-purchase';
import { programarSyncComputo } from '@/lib/computo/programar';
import { resolverPreciosDeCompra, type PrecioResuelto } from '@/lib/precios-compra';

interface CompletionBody {
  storeName?: string;
  totalAmount?: number;
  quantities?: Record<string, number>;
  unitPrices?: Record<string, number>;
  /** Marca comprada esta vez, por producto. Opcional. */
  brands?: Record<string, string>;
}

type CartItem = { product_id: string; quantity_needed: string };

async function insertTrip(storeName: string | null, userId: string, now: string): Promise<string | null> {
  try {
    const rows = await sql`
      INSERT INTO shopping_trips (store_name, date, total_spent, currency, user_id, created_at, updated_at)
      VALUES (${storeName}, ${now}, 0, 'USD', ${userId}, ${now}, ${now})
      RETURNING id
    `;
    return (rows[0] as { id: string }).id;
  } catch {
    // updated_at column may not exist — retry without it
  }
  try {
    const rows = await sql`
      INSERT INTO shopping_trips (store_name, date, total_spent, currency, user_id, created_at)
      VALUES (${storeName}, ${now}, 0, 'USD', ${userId}, ${now})
      RETURNING id
    `;
    return (rows[0] as { id: string }).id;
  } catch (err) {
    console.error('[complete] shopping_trips insert failed:', err);
    return null;
  }
}

async function fetchPriceMap(productIds: string[]): Promise<Record<string, number | null>> {
  const rows = await sql`
    SELECT id, last_purchase_price FROM products
    WHERE id = ANY(${productIds}::uuid[])
  `;
  const map: Record<string, number | null> = {};
  for (const r of rows as { id: string; last_purchase_price: string | null }[]) {
    map[r.id] = r.last_purchase_price == null ? null : Number.parseFloat(r.last_purchase_price);
  }
  return map;
}

async function insertPurchases(
  items: CartItem[],
  quantities: Record<string, number>,
  precios: Record<string, PrecioResuelto>,
  brands: Record<string, string>,
  storeName: string | null,
  tripId: string | null,
  userId: string,
  now: string,
): Promise<{ inserted: number; totalSpent: number; error: string | null }> {
  let inserted = 0;
  let totalSpent = 0;
  try {
    for (const row of items) {
      const qty = cantidadDe(row, quantities);
      const precio = precios[row.product_id];
      const unitPrice = precio?.unitPrice ?? null;
      const totalPrice = unitPrice === null ? null : unitPrice * qty;
      if (totalPrice !== null) totalSpent += totalPrice;
      // La marca queda en la COMPRA: el artículo de despensa sigue siendo uno
      // solo, y su historial de precios pasa a estar etiquetado en vez de
      // mezclado. Ver product-brands.ts.
      const brand = normalizeBrand(brands[row.product_id]);
      // El origen va con el precio (precios-compra.ts): una edición del ticket
      // conserva lo tecleado y solo vuelve a repartir lo repartido.
      await sql`
        INSERT INTO product_purchases
          (product_id, quantity, unit_price, total_price, price_source, currency, purchased_at, store_name, brand, trip_id, user_id, created_at)
        VALUES
          (${row.product_id}, ${qty}, ${unitPrice}, ${totalPrice}, ${precio?.source ?? 'unknown'}, 'USD', ${now}, ${storeName}, ${brand}, ${tripId}, ${userId}, ${now})
      `;
      inserted++;
    }
    return { inserted, totalSpent, error: null };
  } catch (err) {
    return { inserted, totalSpent, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lo que se llevó de cada producto: lo que dijo el súper, o lo que faltaba en casa. */
function cantidadDe(row: CartItem, quantities: Record<string, number>): number {
  return quantities[row.product_id] ?? (Number.parseFloat(row.quantity_needed) || 1);
}

async function notifyShoppingComplete(userId: string, count: number, storeName: string | null): Promise<void> {
  const subRows = await sql`SELECT push_subscription FROM users WHERE id = ${userId} LIMIT 1`;
  const sub = subRows[0]?.push_subscription as PushSubscription | null | undefined;
  if (!sub?.endpoint) return;
  const storeText = storeName ? ` en ${storeName}` : '';
  await sendWebPush(sub, {
    title: '🛒 ¡Compra completada!',
    body: `Repusiste ${count} producto${count === 1 ? '' : 's'}${storeText}. Todo actualizado en tu despensa.`,
    url: '/products',
    data: { type: 'shopping_complete', count },
  });
}

// POST /api/shopping-list/complete
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  // Lleva el cambio a Computo después de responder (solo el dueño; ver lib/computo).
  programarSyncComputo(user.userId);

  let body: CompletionBody = {};
  try { body = (await request.json()) as CompletionBody; } catch { /* body is optional */ }

  const storeName = body.storeName?.trim() || null;
  const quantities: Record<string, number> = body.quantities ?? {};
  const userTotalAmount = typeof body.totalAmount === 'number' && body.totalAmount > 0 ? body.totalAmount : null;
  const rawUnitPrices = (typeof body.unitPrices === 'object' && body.unitPrices !== null)
    ? body.unitPrices
    : {};

  await ensurePurchaseSchema();

  // Per-user isolation
  const rawItems = await sql`
    SELECT id, product_id, quantity_needed FROM shopping_list_items
    WHERE user_id = ${user.userId} AND is_in_cart = true
  `;
  if (!rawItems.length) return NextResponse.json({ completed: 0 });

  // Una compra por PRODUCTO, no por fila de lista.
  //
  // El precio y la cantidad se buscan por `product_id`, así que dos filas del
  // mismo producto generaban dos compras idénticas: el ticket salía al doble y
  // «Más comprados» contaba ese artículo dos veces. Ya no debería haber filas
  // repetidas —hay un índice único desde `ensurePurchaseSchema`—, pero esto es
  // lo que hace que el error no pueda volver aunque la restricción falte en una
  // base vieja o dos pestañas escriban a la vez.
  const items = dedupeByProduct(rawItems as CartItem[]);
  const productIds = items.map((i) => i.product_id);
  const now = new Date().toISOString();

  const [priceMap, tripId] = await Promise.all([
    fetchPriceMap(productIds),
    insertTrip(storeName, user.userId, now),
  ]);

  // Lo tecleado en el súper manda; si no, el último precio; si tampoco, la
  // parte que le toca de lo que queda del total. Cada uno con su origen.
  const precios = resolverPreciosDeCompra({
    lineas: items.map((row) => ({ productId: row.product_id, quantity: cantidadDe(row, quantities) })),
    tecleados: rawUnitPrices,
    ultimos: priceMap,
    totalTicket: userTotalAmount,
  });

  const { inserted: purchasesInserted, totalSpent, error: purchaseError } =
    await insertPurchases(items, quantities, precios, body.brands ?? {}, storeName, tripId, user.userId, now);

  if (tripId) {
    const finalTotal = userTotalAmount ?? (totalSpent > 0 ? totalSpent : null);
    if (finalTotal != null) {
      await sql`UPDATE shopping_trips SET total_spent = ${finalTotal} WHERE id = ${tripId}`.catch(() => undefined);
    }
  }

  // El precio de la tarjeta. Esta vía guardaba cada compra con su precio y no
  // se lo ponía al producto: 33 de los 35 productos comprados con precio
  // salían sin él. Nunca puede tumbar el cierre de la compra.
  await refreshLastPurchase(user.userId, productIds).catch(() => undefined);

  // Update stock for all products in the completed cart (IDs already validated via cart lookup)
  await sql`
    UPDATE products
    SET stock_level = 'full', stock_updated_at = NOW(), is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ANY(${productIds}::uuid[])
  `;

  await sql`DELETE FROM shopping_list_items WHERE user_id = ${user.userId} AND is_in_cart = true`;

  // La compra terminó: lo que «no estaba en el súper» vuelve a la lista para
  // la próxima. Sigue faltando en casa, y la promesa era apartarlo solo hoy.
  await ensureListSkipSchema();
  await sql`
    UPDATE shopping_list_items SET skipped_until = NULL
    WHERE user_id = ${user.userId} AND skipped_until IS NOT NULL
  `;

  await notifyShoppingComplete(user.userId, items.length, storeName).catch(() => undefined);

  // Esta es la vía por la que se compra de verdad, así que es la que más
  // pantallas deja viejas: «Más comprados» en Casa, los totales de Compras, el
  // presupuesto. Sin esto la estadística parecía no actualizarse nunca, porque
  // el `router.refresh()` del súper solo refresca el súper.
  revalidateAfterPurchase();

  return NextResponse.json({ completed: items.length, tripId, purchasesInserted, purchaseError });
}
