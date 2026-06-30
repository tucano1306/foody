import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensurePurchaseSchema } from '@/lib/ensure-schema';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

interface CompletionBody {
  storeName?: string;
  totalAmount?: number;
  quantities?: Record<string, number>;
  unitPrices?: Record<string, number>;
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
  priceMap: Record<string, number | null>,
  storeName: string | null,
  tripId: string | null,
  userId: string,
  now: string,
): Promise<{ inserted: number; totalSpent: number; error: string | null }> {
  let inserted = 0;
  let totalSpent = 0;
  try {
    for (const row of items) {
      const qty = quantities[row.product_id] ?? (Number.parseFloat(row.quantity_needed) || 1);
      const unitPrice = priceMap[row.product_id] ?? null;
      const totalPrice = unitPrice === null ? null : unitPrice * qty;
      if (totalPrice !== null) totalSpent += totalPrice;
      await sql`
        INSERT INTO product_purchases
          (product_id, quantity, unit_price, total_price, price_source, currency, purchased_at, store_name, trip_id, user_id, created_at)
        VALUES
          (${row.product_id}, ${qty}, ${unitPrice}, ${totalPrice}, 'shopping_list', 'USD', ${now}, ${storeName}, ${tripId}, ${userId}, ${now})
      `;
      inserted++;
    }
    return { inserted, totalSpent, error: null };
  } catch (err) {
    return { inserted, totalSpent, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * When the user enters a global trip total and some products have no stored
 * price, distribute the unaccounted remainder proportionally by quantity so
 * that stats always show real money instead of $0.
 */
function resolvePriceMap(
  items: CartItem[],
  quantities: Record<string, number>,
  priceMap: Record<string, number | null>,
  userTotalAmount: number | null,
): Record<string, number | null> {
  if (userTotalAmount === null) return priceMap;

  const resolved: Record<string, number | null> = { ...priceMap };

  const qtyFor = (id: string) => quantities[id] ?? (Number.parseFloat(items.find((r) => r.product_id === id)?.quantity_needed ?? '1') || 1);

  const knownSpend = items.reduce((sum, row) => {
    const p = priceMap[row.product_id];
    return p === null ? sum : sum + p * qtyFor(row.product_id);
  }, 0);

  const remainder = Math.max(0, userTotalAmount - knownSpend);
  const nullQtyTotal = items.reduce(
    (sum, row) => (priceMap[row.product_id] === null ? sum + qtyFor(row.product_id) : sum),
    0,
  );

  if (remainder > 0 && nullQtyTotal > 0) {
    const fallbackUnit = remainder / nullQtyTotal;
    for (const row of items) {
      resolved[row.product_id] ??= fallbackUnit;
    }
  }

  return resolved;
}

function mergeScannedPrices(
  priceMap: Record<string, number | null>,
  rawUnitPrices: Record<string, unknown>,
  productIds: string[],
): Record<string, number | null> {
  const merged: Record<string, number | null> = { ...priceMap };
  for (const [pid, p] of Object.entries(rawUnitPrices)) {
    if (typeof p === 'number' && p > 0 && productIds.includes(pid)) {
      merged[pid] = p;
    }
  }
  return merged;
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

  const items = rawItems as CartItem[];
  const productIds = items.map((i) => i.product_id);
  const now = new Date().toISOString();

  const [priceMap, tripId] = await Promise.all([
    fetchPriceMap(productIds),
    insertTrip(storeName, user.userId, now),
  ]);

  // Merge user-scanned prices over DB prices (validated: positive number, known product)
  const mergedPriceMap = mergeScannedPrices(priceMap, rawUnitPrices, productIds);

  const resolvedPriceMap = resolvePriceMap(items, quantities, mergedPriceMap, userTotalAmount);

  const { inserted: purchasesInserted, totalSpent, error: purchaseError } =
    await insertPurchases(items, quantities, resolvedPriceMap, storeName, tripId, user.userId, now);

  if (tripId) {
    const finalTotal = userTotalAmount ?? (totalSpent > 0 ? totalSpent : null);
    if (finalTotal != null) {
      await sql`UPDATE shopping_trips SET total_spent = ${finalTotal} WHERE id = ${tripId}`.catch(() => undefined);
    }
  }

  // Update stock for all products in the completed cart (IDs already validated via cart lookup)
  await sql`
    UPDATE products
    SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ANY(${productIds}::uuid[])
  `;

  await sql`DELETE FROM shopping_list_items WHERE user_id = ${user.userId} AND is_in_cart = true`;

  await notifyShoppingComplete(user.userId, items.length, storeName).catch(() => undefined);

  return NextResponse.json({ completed: items.length, tripId, purchasesInserted, purchaseError });
}
