import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

// PATCH /api/shopping-list/[id]/toggle-cart
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  // Toggle is_in_cart
  const rows = await sql`
    UPDATE shopping_list_items
    SET is_in_cart = NOT is_in_cart, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (!rows.length) return notFound();

  const item = rows[0] as Record<string, unknown>;

  // Fetch product info to return full ShoppingListItem shape
  const productRows = await sql`
    SELECT * FROM products WHERE id = ${item.product_id} LIMIT 1
  `;
  const product = productRows[0] as Record<string, unknown> | undefined;

  return NextResponse.json({
    ...item,
    product_name:            product?.name ?? '',
    product_description:     product?.description ?? null,
    product_photo_url:       product?.photo_url ?? null,
    product_category:        product?.category ?? null,
    product_current_quantity: product?.current_quantity ?? 0,
    product_min_quantity:    product?.min_quantity ?? 1,
    product_unit:            product?.unit ?? 'units',
    product_stock_level:     product?.stock_level ?? 'full',
    product_is_running_low:  product?.is_running_low ?? false,
    product_needs_shopping:  product?.needs_shopping ?? false,
    product_user_id:         product?.user_id ?? item.user_id,
    product_created_at:      product?.created_at ?? item.created_at,
    product_updated_at:      product?.updated_at ?? item.updated_at,
  });
}
