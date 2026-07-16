import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { allocate, resolveItems, round2 } from '@/lib/trip-allocation';
import type { ShoppingTripItemDto } from '@foody/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT * FROM shopping_trips WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

interface UpdateTripBody {
  storeName?: string;
  purchasedAt?: string;
  totalAmount?: number;
  notes?: string;
  items?: ShoppingTripItemDto[];
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json() as UpdateTripBody;

  // Per-user isolation: fetch the current row first (also validates ownership).
  const existing = await sql`SELECT * FROM shopping_trips WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!existing.length) return notFound();
  const current = existing[0] as { date: string; total_spent: number | string | null; store_name: string | null; currency: string | null };

  const storeName = typeof body.storeName === 'string' && body.storeName.trim().length > 0
    ? body.storeName.trim()
    : null;
  const purchasedAt = typeof body.purchasedAt === 'string' ? body.purchasedAt : null;
  const totalAmount = typeof body.totalAmount === 'number' && Number.isFinite(body.totalAmount)
    ? round2(body.totalAmount)
    : null;
  const items = Array.isArray(body.items) ? body.items : null;

  const effectiveTotal = totalAmount ?? round2(Number(current.total_spent ?? 0));
  if (items !== null && items.length === 0 && effectiveTotal <= 0) {
    return NextResponse.json(
      { message: 'Agrega al menos un producto o un total mayor a 0' },
      { status: 400 },
    );
  }

  const rows = await sql`
    UPDATE shopping_trips SET
      store_name = COALESCE(${storeName}, store_name),
      date = COALESCE(${purchasedAt}, date),
      total_spent = COALESCE(${totalAmount}, total_spent),
      notes = COALESCE(${typeof body.notes === 'string' ? body.notes : null}, notes),
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId} RETURNING *
  `;
  const trip = rows[0] as Record<string, unknown>;
  const effectiveStore = (trip.store_name as string | null) ?? null;
  // El driver devuelve `date` como objeto Date; String(Date) produce
  // "GMT-0400 (…)" que Postgres no puede parsear — normaliza a ISO.
  const effectiveDate = new Date(trip.date as string).toISOString();
  const currency = (trip.currency as string | null) ?? 'USD';
  const now = new Date().toISOString();

  if (items === null) {
    // Metadata-only edit: keep the trip's purchases consistent with the new
    // store/date so stats and price history don't drift apart.
    if (storeName !== null || purchasedAt !== null) {
      await sql`
        UPDATE product_purchases
        SET store_name = ${effectiveStore}, purchased_at = ${effectiveDate}
        WHERE trip_id = ${id} AND user_id = ${user.userId}
      `;
    }
    return NextResponse.json({ trip, items: [] });
  }

  // Items edit: rewrite this trip's purchases with a fresh allocation, the
  // same way POST creates them.
  const resolved = resolveItems(items);
  const allocations = allocate(resolved, effectiveTotal, 'manual_partial');

  await sql`DELETE FROM product_purchases WHERE trip_id = ${id} AND user_id = ${user.userId}`;

  const productIds: string[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const item = resolved[i];
    const alloc = allocations[i];
    productIds.push(item.productId);
    await sql`
      INSERT INTO product_purchases
        (product_id, trip_id, quantity, unit_price, total_price, price_source, currency, purchased_at, store_name, user_id, created_at)
      VALUES
        (${item.productId}, ${id}, ${item.quantity}, ${alloc.unitPrice}, ${alloc.totalPrice}, ${alloc.priceSource}, ${currency}, ${effectiveDate}, ${effectiveStore}, ${user.userId}, ${now})
    `;

    // Refresh last-known price only when this trip is at least as recent as
    // the stored one (same guard as POST — a back-dated edit never clobbers
    // a newer price).
    if (alloc.unitPrice != null && alloc.unitPrice > 0) {
      await sql`
        UPDATE products
        SET last_purchase_price = ${alloc.unitPrice},
            last_purchase_date = ${effectiveDate},
            updated_at = NOW()
        WHERE id = ${item.productId}
          AND user_id = ${user.userId}
          AND (last_purchase_date IS NULL OR last_purchase_date <= ${effectiveDate})
      `;
    }
  }

  if (productIds.length > 0) {
    await sql`
      UPDATE products
      SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
      WHERE id = ANY(${productIds}::uuid[])
        AND user_id = ${user.userId}
    `;
  }

  return NextResponse.json({ trip, items: allocations });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  // Per-user isolation. Remove the trip's purchases first so stats and price
  // comparisons don't keep counting a deleted ticket.
  await sql`DELETE FROM product_purchases WHERE trip_id = ${id} AND user_id = ${user.userId}`;
  const rows = await sql`DELETE FROM shopping_trips WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
