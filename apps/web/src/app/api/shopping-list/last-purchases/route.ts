import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// GET /api/shopping-list/last-purchases
// Returns the most recent product_purchases entry per product for the current user
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const rows = await sql`
    SELECT DISTINCT ON (pp.product_id)
      pp.product_id  AS "productId",
      pp.purchased_at AS "purchasedAt",
      pp.store_name  AS "storeName"
    FROM product_purchases pp
    WHERE pp.user_id = ${user.userId}
    ORDER BY pp.product_id, pp.purchased_at DESC
  `;

  return NextResponse.json(rows);
}
