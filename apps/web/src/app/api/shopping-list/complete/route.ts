import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

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

  // Create a shopping trip record
  const [tripRow] = await sql`
    INSERT INTO shopping_trips (store_name, date, total_spent, currency, user_id, created_at, updated_at)
    VALUES (${storeName}, ${now}, 0, 'MXN', ${user.userId}, ${now}, ${now})
    RETURNING id
  `;
  const tripId = (tripRow as { id: string }).id;

  // Create a product_purchase record for each in-cart item
  for (const item of items) {
    const row = item as { product_id: string; quantity_needed: string };
    const qty = quantities[row.product_id] ?? Number.parseFloat(row.quantity_needed) ?? 1;
    await sql`
      INSERT INTO product_purchases
        (id, product_id, quantity, price_source, currency, purchased_at, store_name, trip_id, user_id, created_at)
      VALUES
        (gen_random_uuid(), ${row.product_id}, ${qty}, 'unknown', 'MXN', ${now}, ${storeName}, ${tripId}, ${user.userId}, ${now})
    `;
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

  return NextResponse.json({ completed: items.length, tripId });
}
