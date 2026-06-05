import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

// PATCH /api/products/[id]/stock-level
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const level = body.level;
  if (level !== 'full' && level !== 'half' && level !== 'empty') {
    return NextResponse.json({ message: 'level must be full, half, or empty' }, { status: 422 });
  }

  const isRunningLow = level !== 'full';
  const needsShopping = level === 'empty';

  try {
    // Per-user isolation: only the owner of the product can change its stock.
    const rows = await sql`
      UPDATE products SET stock_level = ${level}, is_running_low = ${isRunningLow}, needs_shopping = ${needsShopping}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId}
      RETURNING *
    `;
    if (!rows.length) return notFound();

    if (level === 'full') {
      await sql`DELETE FROM shopping_list_items WHERE product_id = ${id} AND user_id = ${user.userId}`;
    } else {
      await sql`
        INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
        VALUES (gen_random_uuid(), ${id}, ${user.userId}, NULL, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
    }

    // Push notification when a product runs out
    if (level === 'empty') {
      const productName = String(rows[0].name ?? '');
      const subRows = await sql`SELECT push_subscription FROM users WHERE id = ${user.userId} LIMIT 1`;
      const sub = subRows[0]?.push_subscription as PushSubscription | null | undefined;
      if (sub?.endpoint) {
        await sendWebPush(sub, {
          title: '⚠️ Producto agotado',
          body: `${productName} se marcó como agotado y fue agregado a tu lista de compras.`,
          url: `/products?product=${id}`,
          data: { type: 'stock_empty', productId: id },
        });
      }
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
