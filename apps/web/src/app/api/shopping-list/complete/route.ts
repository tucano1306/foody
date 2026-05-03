import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensurePurchaseSchema } from '@/lib/ensure-schema';

interface CompletionBody {
  storeName?: string;
  totalAmount?: number;
  quantities?: Record<string, number>;
}

type CartItem = { product_id: string; quantity_needed: string };

async function insertTrip(storeName: string | null, userId: string, now: string): Promise<string | null> {
  try {
    const rows = await sql`
      INSERT INTO shopping_trips (store_name, purchased_at, total_amount, currency, user_id, created_at, updated_at)
      VALUES (${storeName}, ${now}, 0, 'MXN', ${userId}, ${now}, ${now})
      RETURNING id
    `;
    return (rows[0] as { id: string }).id;
  } catch {
    // updated_at column may not exist — retry without it
  }
  try {
    const rows = await sql`
      INSERT INTO shopping_trips (store_name, purchased_at, total_amount, currency, user_id, created_at)
      VALUES (${storeName}, ${now}, 0, 'MXN', ${userId}, ${now})
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
      const totalPrice = unitPrice == null ? null : unitPrice * qty;
      if (totalPrice != null) totalSpent += totalPrice;
      await sql`
        INSERT INTO product_purchases
          (product_id, quantity, unit_price, total_price, price_source, currency, purchased_at, store_name, trip_id, user_id, created_at)
        VALUES
          (${row.product_id}, ${qty}, ${unitPrice}, ${totalPrice}, 'shopping_list', 'MXN', ${now}, ${storeName}, ${tripId}, ${userId}, ${now})
      `;
      inserted++;
    }
    return { inserted, totalSpent, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[complete] product_purchases insert failed:', error);
    return { inserted, totalSpent, error };
  }
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

  const { inserted: purchasesInserted, totalSpent, error: purchaseError } =
    await insertPurchases(items, quantities, priceMap, storeName, tripId, user.userId, now);

  if (tripId) {
    const finalTotal = userTotalAmount ?? (totalSpent > 0 ? totalSpent : null);
    if (finalTotal != null) {
      await sql`UPDATE shopping_trips SET total_amount = ${finalTotal} WHERE id = ${tripId}`.catch(() => undefined);
    }
  }

  // Update stock for all products in the completed cart (IDs already validated via cart lookup)
  await sql`
    UPDATE products
    SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ANY(${productIds}::uuid[])
  `;

  await sql`DELETE FROM shopping_list_items WHERE user_id = ${user.userId} AND is_in_cart = true`;

  return NextResponse.json({ completed: items.length, tripId, purchasesInserted, purchaseError });
}
