import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { findAccessibleProduct } from '@/lib/product-access';

// PATCH /api/products/[id]/mark-ok
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  // Own products + products shared with me by my household
  const access = await findAccessibleProduct(id, user.userId);
  if (!access) return notFound();

  const rows = await sql`
    UPDATE products SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `;
  if (!rows.length) return notFound();

  await sql`DELETE FROM shopping_list_items WHERE product_id = ${id} AND user_id = ${user.userId}`;

  return NextResponse.json(rows[0]);
}
