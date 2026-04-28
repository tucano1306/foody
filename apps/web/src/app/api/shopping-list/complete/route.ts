import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// POST /api/shopping-list/complete
// Marks all in-cart items as purchased and resets products to 'full'
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  // Get all in-cart items for this user
  const items = await sql`
    SELECT id, product_id FROM shopping_list_items
    WHERE user_id = ${user.userId} AND is_in_cart = true
  `;

  if (!items.length) {
    return NextResponse.json({ completed: 0 });
  }

  const productIds = items.map((i) => (i as { product_id: string }).product_id);

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

  return NextResponse.json({ completed: items.length });
}
