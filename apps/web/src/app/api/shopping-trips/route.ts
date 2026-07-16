import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';
import { allocate, resolveItems, round2 } from '@/lib/trip-allocation';
import type { Allocation } from '@/lib/trip-allocation';
import type { AllocationStrategy, CreateShoppingTripDto } from '@foody/types';

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const rows = await sql`SELECT * FROM shopping_trips WHERE user_id = ${user.userId} ORDER BY date DESC`;
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as CreateShoppingTripDto;

  const bodyItems = body.items ?? [];
  const totalAmount = round2(body.totalAmount ?? 0);

  // A trip with no linked items is valid as long as it carries a total —
  // receipt scans often can't match any catalog product, but the total spent
  // is still worth recording.
  if (bodyItems.length === 0 && totalAmount <= 0) {
    return NextResponse.json(
      { message: 'Agrega al menos un producto o un total mayor a 0' },
      { status: 400 },
    );
  }

  const id = randomUUID();
  const strategy: AllocationStrategy = body.allocationStrategy ?? 'manual_partial';
  const currency = body.currency ?? 'USD';
  const purchasedAt = body.purchasedAt ?? new Date().toISOString();
  const storeName = body.storeName ?? null;
  const storeId = body.storeId ?? null;
  const now = new Date().toISOString();

  // Resolve items
  const resolved = resolveItems(bodyItems);

  // Allocate prices
  const allocations: Allocation[] =
    strategy === 'none' || totalAmount > 0
      ? allocate(resolved, totalAmount, strategy)
      : resolved.map((it) => ({
          unitPrice: it.manualUnitPrice,
          totalPrice: it.manualTotalPrice,
          priceSource: it.manualUnitPrice === null ? 'unknown' : 'manual',
        }));

  // Create trip. The live shopping_trips table uses `date` / `total_spent`
  // (verified against the Neon schema) — not purchased_at/total_amount, and it
  // has no allocation_strategy column.
  await sql`
    INSERT INTO shopping_trips
      (id, store_id, store_name, date, total_spent, currency, notes, user_id, created_at, updated_at)
    VALUES
      (${id}, ${storeId}, ${storeName}, ${purchasedAt}, ${totalAmount}, ${currency}, ${body.notes ?? null}, ${user.userId}, ${now}, ${now})
  `;

  // Create product purchases
  const productIds: string[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const item = resolved[i];
    const alloc = allocations[i];
    productIds.push(item.productId);
    await sql`
      INSERT INTO product_purchases
        (product_id, trip_id, quantity, unit_price, total_price, price_source, currency, purchased_at, store_name, user_id, created_at)
      VALUES
        (${item.productId}, ${id}, ${item.quantity}, ${alloc.unitPrice}, ${alloc.totalPrice}, ${alloc.priceSource}, ${currency}, ${purchasedAt}, ${storeName}, ${user.userId}, ${now})
    `;

    // Refresh the product's last-known price/date so predictions (the "prefill
    // last price" suggestion, price displays) reflect this trip. Only advance
    // it when this purchase is at least as recent as the stored one, so a
    // back-dated trip never clobbers a newer price.
    if (alloc.unitPrice != null && alloc.unitPrice > 0) {
      await sql`
        UPDATE products
        SET last_purchase_price = ${alloc.unitPrice},
            last_purchase_date = ${purchasedAt},
            updated_at = NOW()
        WHERE id = ${item.productId}
          AND user_id = ${user.userId}
          AND (last_purchase_date IS NULL OR last_purchase_date <= ${purchasedAt})
      `;
    }
  }

  // Mark purchased products as full (they were just bought)
  if (productIds.length > 0) {
    await sql`
      UPDATE products
      SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
      WHERE id = ANY(${productIds}::uuid[])
        AND user_id = ${user.userId}
    `;
  }

  const tripRows = await sql`SELECT * FROM shopping_trips WHERE id = ${id} LIMIT 1`;
  return NextResponse.json({ trip: tripRows[0], items: allocations }, { status: 201 });
}

