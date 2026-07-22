import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { findAccessibleProduct } from '@/lib/product-access';

// PATCH /api/products/[id]/mark-low
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  // Own products + products shared with me by my household
  const access = await findAccessibleProduct(id, user.userId);
  if (!access) return notFound();

  const rows = await sql`
    UPDATE products SET stock_level = 'half', is_running_low = true, needs_shopping = true, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `;
  if (!rows.length) return notFound();

  // Add to my own shopping list
  await sql`
    INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
    VALUES (gen_random_uuid(), ${id}, ${user.userId}, NULL, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `;

  return NextResponse.json(rows[0]);
}
