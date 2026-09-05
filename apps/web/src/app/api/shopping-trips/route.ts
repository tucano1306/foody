import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';
import { allocate, resolveItems, round2 } from '@/lib/trip-allocation';
import type { Allocation } from '@/lib/trip-allocation';
import type { AllocationStrategy, CreateShoppingTripDto } from '@foody/types';
import { normalizeShare } from '@/lib/expense-scope';
import { normalizeExpenseKind } from '@/lib/expense-kind';
import { ensureExpenseKindSchema, ensureExpenseScopeSchema, ensureTripSplitsSchema } from '@/lib/ensure-schema';
import { normalizeSplits, validateSplits } from '@/lib/trip-splits';
import { revalidateAfterPurchase } from '@/lib/revalidate-purchases';

/**
 * Lista los tickets de SUPER. Los de otro tipo (comida fuera, farmacia…) no
 * salen aquí: son gasto del Plan Financiero, no despensa.
 *
 * `?kind=all` los devuelve todos, para quien necesite el histórico completo.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureExpenseKindSchema();

  const rows = request.nextUrl.searchParams.get('kind') === 'all'
    ? await sql`SELECT * FROM shopping_trips WHERE user_id = ${user.userId} ORDER BY date DESC`
    : await sql`SELECT * FROM shopping_trips WHERE user_id = ${user.userId} AND kind = 'grocery' ORDER BY date DESC`;
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const body = await request.json() as CreateShoppingTripDto;
  await ensureExpenseScopeSchema();
  await ensureExpenseKindSchema();
  await ensureTripSplitsSchema();

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
  // Qué clase de gasto es. Ausente = super, que es el caso normal y el
  // comportamiento que la app tenía antes de que existiera esta columna.
  const kind = normalizeExpenseKind(body.kind);
  const isGrocery = kind === 'grocery';

  // Las partes del ticket que son de otro tipo. Se validan ANTES de insertar
  // nada: un ticket guardado a medias con un reparto imposible dejaría el
  // gasto del mes descuadrado y sin forma de saber por dónde.
  const splits = normalizeSplits(body.splits);
  const splitError = validateSplits(totalAmount, splits);
  if (splitError) return NextResponse.json({ message: splitError }, { status: 400 });

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
      (id, store_id, store_name, date, total_spent, currency, notes, business_share, kind, user_id, created_at, updated_at)
    VALUES
      (${id}, ${storeId}, ${storeName}, ${purchasedAt}, ${totalAmount}, ${currency}, ${body.notes ?? null}, ${normalizeShare(body.businessShare)}, ${kind}, ${user.userId}, ${now}, ${now})
  `;

  for (const part of splits) {
    await sql`
      INSERT INTO shopping_trip_splits (id, trip_id, user_id, kind, amount, note, created_at)
      VALUES (${randomUUID()}, ${id}, ${user.userId}, ${part.kind}, ${part.amount}, ${part.note}, ${now})
    `;
  }

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
    //
    // Solo para el SUPER: lo que costó un plato en un restaurante no es el
    // precio de despensa de nada, y dejarlo entrar envenenaría el comparador.
    if (isGrocery && alloc.unitPrice != null && alloc.unitPrice > 0) {
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

  // Mark purchased products as full (they were just bought) and clear them
  // from the shopping list — a restocked product must not keep showing in
  // Modo Supermercado.
  //
  // Otra vez, solo el SUPER llena la despensa: cenar fuera no repone nada.
  if (isGrocery && productIds.length > 0) {
    await sql`
      UPDATE products
      SET stock_level = 'full', stock_updated_at = NOW(), is_running_low = false, needs_shopping = false, updated_at = NOW()
      WHERE id = ANY(${productIds}::uuid[])
        AND user_id = ${user.userId}
    `;
    await sql`
      DELETE FROM shopping_list_items
      WHERE product_id = ANY(${productIds}::uuid[])
        AND user_id = ${user.userId}
    `;
  }

  const tripRows = await sql`SELECT * FROM shopping_trips WHERE id = ${id} LIMIT 1`;
  // Casa, Compras, Stats y el presupuesto se calculan con estas filas: hay que
  // tirar su caché o siguen contando la despensa de antes de este ticket.
  revalidateAfterPurchase();
  return NextResponse.json({ trip: tripRows[0], items: allocations }, { status: 201 });
}

