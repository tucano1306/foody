import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

async function findProduct(id: string, userId: string) {
  const rows = await sql`SELECT * FROM products WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
  return rows[0] ?? null;
}

// POST /api/products/[id]/purchases
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;

  const product = await findProduct(id, user.userId);
  if (!product) return notFound();

  const body = await request.json() as {
    quantity?: unknown;
    unitPrice?: unknown;
    totalPrice?: unknown;
    currency?: unknown;
    purchasedAt?: unknown;
    storeId?: unknown;
    storeName?: unknown;
  };

  const qty = Number(body.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ message: 'quantity must be a positive number' }, { status: 422 });
  }
  if (body.unitPrice == null && body.totalPrice == null) {
    return NextResponse.json({ message: 'unitPrice or totalPrice is required' }, { status: 422 });
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const unitPrice =
    body.unitPrice == null
      ? round2(Number(body.totalPrice) / qty)
      : round2(Number(body.unitPrice));
  const totalPrice =
    body.totalPrice == null
      ? round2(unitPrice * qty)
      : round2(Number(body.totalPrice));

  const currency =
    typeof body.currency === 'string' ? body.currency : ((product as Record<string, unknown>).currency as string | null) ?? 'MXN';
  const purchasedAt =
    typeof body.purchasedAt === 'string' ? body.purchasedAt : new Date().toISOString();
  const storeName =
    typeof body.storeName === 'string' && body.storeName.trim() ? body.storeName.trim() : null;
  const storeId =
    typeof body.storeId === 'string' && body.storeId ? body.storeId : null;

  const purchaseId = randomUUID();

  await sql`
    INSERT INTO product_purchases
      (id, product_id, quantity, unit_price, total_price, price_source, currency,
       purchased_at, store_name, store_id, trip_id, user_id, household_id, created_at)
    VALUES
      (${purchaseId}, ${id}, ${qty}, ${unitPrice}, ${totalPrice}, 'manual', ${currency},
       ${purchasedAt}, ${storeName}, ${storeId}, NULL, ${user.userId}, NULL, NOW())
  `;

  // Update product aggregates and reset stock to full
  const updatedRows = await sql`
    UPDATE products SET
      current_quantity = current_quantity + ${qty},
      stock_level      = 'full',
      is_running_low   = false,
      needs_shopping   = false,
      last_purchase_price = ${unitPrice},
      last_purchase_date  = NOW(),
      updated_at       = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;

  // Remove from shopping list
  await sql`
    DELETE FROM shopping_list_items
    WHERE product_id = ${id} AND user_id = ${user.userId}
  `;

  return NextResponse.json({ product: updatedRows[0], purchase: { id: purchaseId } });
}
