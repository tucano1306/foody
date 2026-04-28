import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

function asStr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function toStatus(stockLevel: string): string {
  if (stockLevel === 'empty') return 'empty';
  if (stockLevel === 'half') return 'low';
  return 'ok';
}

// PATCH /api/shopping-list/[id]/toggle-cart
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const rows = await sql`
    UPDATE shopping_list_items
    SET is_in_cart = NOT is_in_cart, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (!rows.length) return notFound();

  const item = rows[0] as Record<string, unknown>;

  const productRows = await sql`SELECT * FROM products WHERE id = ${item.product_id} LIMIT 1`;
  const p = (productRows[0] ?? {}) as Record<string, unknown>;

  const stockLevel = asStr(p.stock_level, 'full');

  return NextResponse.json({
    id: String(item.id),
    productId: String(item.product_id),
    product: {
      id: String(item.product_id),
      name: asStr(p.name, ''),
      description: (p.description as string | null) ?? null,
      photoUrl: (p.photo_url as string | null) ?? null,
      category: (p.category as string | null) ?? null,
      currentQuantity: Number(p.current_quantity ?? 0),
      minQuantity: Number(p.min_quantity ?? 1),
      unit: asStr(p.unit, 'units'),
      stockLevel,
      isRunningLow: Boolean(p.is_running_low),
      needsShopping: Boolean(p.needs_shopping),
      status: toStatus(stockLevel),
      userId: asStr(p.user_id, String(item.user_id)),
      createdAt: asStr(p.created_at, String(item.created_at)),
      updatedAt: asStr(p.updated_at, String(item.updated_at)),
      lastPurchasePrice: null,
      lastPurchaseDate: null,
      avgPrice: null,
      totalSpent: 0,
      totalPurchasedQty: 0,
      currency: asStr(p.currency, 'MXN'),
    },
    quantityNeeded: Number(item.quantity_needed ?? 1),
    isInCart: Boolean(item.is_in_cart),
    isPurchased: Boolean(item.is_purchased),
    userId: String(item.user_id),
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
  });
}
