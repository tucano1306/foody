import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensurePurchaseSchema } from '@/lib/ensure-schema';

interface CompletionBody {
  storeName?: string;
  quantities?: Record<string, number>; // productId → quantity
}

// POST /api/shopping-list/complete
// Marks all in-cart items as purchased, records a shopping trip + product purchases, resets stock
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: CompletionBody = {};
  try {
    body = (await request.json()) as CompletionBody;
  } catch {
    // body is optional
  }

  const storeName = body.storeName?.trim() || null;
  const quantities: Record<string, number> = body.quantities ?? {};

  // Ensure tables exist (creates them if this is the first run in this environment)
  await ensurePurchaseSchema();

  // Get all in-cart items for this user
  const items = await sql`
    SELECT id, product_id, quantity_needed FROM shopping_list_items
    WHERE user_id = ${user.userId} AND is_in_cart = true
  `;

  if (!items.length) {
    return NextResponse.json({ completed: 0 });
  }

  const productIds = items.map((i) => (i as { product_id: string }).product_id);
  const now = new Date().toISOString();

  // Try to record a shopping trip (non-fatal if table is missing)
  let tripId: string | null = null;
  try {
    const tripRows = await sql`
      INSERT INTO shopping_trips (store_name, date, total_spent, currency, user_id, created_at, updated_at)
      VALUES (${storeName}, ${now}, 0, 'MXN', ${user.userId}, ${now}, ${now})
      RETURNING id
    `;
    tripId = (tripRows[0] as { id: string }).id;
  } catch {
    // updated_at may not exist in all envs — retry without it
    try {
      const tripRows = await sql`
        INSERT INTO shopping_trips (store_name, date, total_spent, currency, user_id, created_at)
        VALUES (${storeName}, ${now}, 0, 'MXN', ${user.userId}, ${now})
        RETURNING id
      `;
      tripId = (tripRows[0] as { id: string }).id;
    } catch (error_) {
      console.error('[complete] shopping_trips insert failed (non-fatal):', error_);
    }
  }

  // Record individual product purchases (always attempt, tripId may be null)
  let purchasesInserted = 0;
  let purchaseError: string | null = null;
  try {
    for (const item of items) {
      const row = item as { product_id: string; quantity_needed: string };
      const qty = quantities[row.product_id] ?? (Number.parseFloat(row.quantity_needed) || 1);
      await sql`
        INSERT INTO product_purchases
          (product_id, quantity, price_source, currency, purchased_at, store_name, trip_id, user_id, created_at)
        VALUES
          (${row.product_id}, ${qty}, 'shopping_list', 'MXN', ${now}, ${storeName}, ${tripId}, ${user.userId}, ${now})
      `;
      purchasesInserted++;
    }
  } catch (err) {
    purchaseError = err instanceof Error ? err.message : String(err);
    console.error('[complete] product_purchases insert failed:', purchaseError);
  }

  // Reset products to full stock
  await sql`
    UPDATE products
    SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ANY(${productIds}::uuid[]) AND user_id = ${user.userId}
  `;

  // Delete the completed shopping list items
  await sql`
    DELETE FROM shopping_list_items
    WHERE user_id = ${user.userId} AND is_in_cart = true
  `;

  return NextResponse.json({ completed: items.length, tripId, purchasesInserted, purchaseError });
}
