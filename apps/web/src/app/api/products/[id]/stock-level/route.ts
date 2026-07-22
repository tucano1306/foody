import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { findAccessibleProduct } from '@/lib/product-access';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

// Best-effort push notification when a product drops to low/empty stock.
// Never throws: notifications must not affect the stock-update response
// (otherwise the client would revert its optimistic UI update).
async function notifyStockChange(
  userId: string,
  productId: string,
  productName: string,
  level: 'half' | 'empty',
): Promise<void> {
  try {
    const subRows = await sql`SELECT push_subscription FROM users WHERE id = ${userId} LIMIT 1`;
    const sub = subRows[0]?.push_subscription as PushSubscription | null | undefined;
    if (!sub?.endpoint) return;

    const payload = level === 'empty'
      ? {
          title: '🚨 Producto agotado',
          body: `${productName} se marcó como agotado y se agregó a tu lista de compras.`,
          url: `/products?product=${productId}`,
          data: { type: 'stock_empty', productId },
        }
      : {
          title: '⚠️ Queda poco',
          body: `${productName} se está agotando y se agregó a tu lista de compras.`,
          url: `/products?product=${productId}`,
          data: { type: 'stock_low', productId },
        };

    const result = await sendWebPush(sub, payload);
    // Endpoint expired / VAPID rotated → drop it so the client can resubscribe
    // instead of silently failing on every future change.
    if (result.gone) {
      await sql`UPDATE users SET push_subscription = NULL, updated_at = NOW() WHERE id = ${userId}`;
    }
  } catch {
    // Swallow — notifications are best-effort.
  }
}

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

  // Shared pantry: my own products, plus products another household member
  // shared with me — anyone in the house can report "se acabó".
  const access = await findAccessibleProduct(id, user.userId);
  if (!access) return notFound();
  const ownerId = String(access.product.user_id);

  try {
    // The CTE captures the level *before* the update so we only notify on a
    // real transition (avoids duplicate pushes when re-tapping the same level).
    const rows = await sql`
      WITH previous AS (
        SELECT stock_level AS prev FROM products WHERE id = ${id}
      )
      UPDATE products SET stock_level = ${level}, is_running_low = ${isRunningLow}, needs_shopping = ${needsShopping}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *, (SELECT prev FROM previous) AS previous_stock_level
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

    const { previous_stock_level: previousLevel, ...product } = rows[0] as Record<string, unknown>;
    const productName = typeof product.name === 'string' ? product.name : '';

    // Notify when stock actually drops to low or empty. The push goes to the
    // product's owner: for my own products that's me (unchanged), and when a
    // household member marks a shared product, the owner is the one who needs
    // to know.
    if (level !== previousLevel && (level === 'half' || level === 'empty')) {
      await notifyStockChange(ownerId, id, productName, level);
    }

    return NextResponse.json(product);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
