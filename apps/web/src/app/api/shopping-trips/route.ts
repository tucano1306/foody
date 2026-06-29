import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';
import type { AllocationStrategy, CreateShoppingTripDto, ShoppingTripItemDto } from '@foody/types';

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface ResolvedItem {
  productId: string;
  quantity: number;
  manualUnitPrice: number | null;
  manualTotalPrice: number | null;
}

interface Allocation {
  unitPrice: number | null;
  totalPrice: number | null;
  priceSource: string;
}

function normalizeManual(item: ShoppingTripItemDto): { unitPrice: number | null; totalPrice: number | null } {
  if (item.unitPrice == null && item.totalPrice == null) return { unitPrice: null, totalPrice: null };
  const unit = item.unitPrice == null
    ? round2((item.totalPrice ?? 0) / item.quantity)
    : round2(item.unitPrice);
  const total = item.totalPrice == null ? round2(unit * item.quantity) : round2(item.totalPrice);
  return { unitPrice: unit, totalPrice: total };
}

function weightFor(it: ResolvedItem): number {
  return Math.max(0.01, it.quantity * (it.manualUnitPrice ?? 1));
}

function allocate(items: ResolvedItem[], totalAmount: number, strategy: AllocationStrategy): Allocation[] {
  const n = items.length;
  if (n === 0) return [];

  if (strategy === 'none') {
    return items.map((it) =>
      it.manualUnitPrice != null && it.manualTotalPrice != null
        ? { unitPrice: it.manualUnitPrice, totalPrice: it.manualTotalPrice, priceSource: 'manual' }
        : { unitPrice: null, totalPrice: null, priceSource: 'unknown' },
    );
  }

  if (strategy === 'manual_partial') {
    const manualSum = items.reduce((s, it) => s + (it.manualTotalPrice ?? 0), 0);
    const remaining = round2(totalAmount - manualSum);
    const unpriced = items.filter((it) => it.manualTotalPrice == null);

    if (unpriced.length === 0) {
      return items.map((it) => ({
        unitPrice: it.manualUnitPrice,
        totalPrice: it.manualTotalPrice,
        priceSource: 'manual',
      }));
    }
    if (remaining <= 0) {
      return items.map((it) =>
        it.manualTotalPrice == null
          ? { unitPrice: null, totalPrice: null, priceSource: 'unknown' }
          : { unitPrice: it.manualUnitPrice, totalPrice: it.manualTotalPrice, priceSource: 'manual' },
      );
    }

    const weights = unpriced.map((it) => weightFor(it));
    const weightSum = weights.reduce((a, b) => a + b, 0) || unpriced.length;
    const shares = unpriced.map((_, i) => round2((remaining * weights[i]) / weightSum));
    const drift = round2(remaining - shares.reduce((a, b) => a + b, 0));
    shares[shares.length - 1] = round2((shares.at(-1) ?? 0) + drift);

    let unpricedIdx = 0;
    return items.map((it) => {
      if (it.manualTotalPrice != null) {
        return { unitPrice: it.manualUnitPrice, totalPrice: it.manualTotalPrice, priceSource: 'manual' };
      }
      const share = shares[unpricedIdx];
      unpricedIdx += 1;
      const unit = it.quantity > 0 ? round2(share / it.quantity) : 0;
      return { unitPrice: unit, totalPrice: share, priceSource: 'allocated' };
    });
  }

  if (strategy === 'equal') {
    const base = round2(totalAmount / n);
    const perItems = items.map(() => base);
    const drift = round2(totalAmount - perItems.reduce((a, b) => a + b, 0));
    perItems[perItems.length - 1] = round2((perItems.at(-1) ?? 0) + drift);
    return items.map((it, i) => {
      const share = perItems[i];
      return { unitPrice: it.quantity > 0 ? round2(share / it.quantity) : 0, totalPrice: share, priceSource: 'allocated' };
    });
  }

  // by_quantity
  const weights = items.map((it) => weightFor(it));
  const weightSum = weights.reduce((a, b) => a + b, 0) || n;
  const shares = items.map((_, i) => round2((totalAmount * weights[i]) / weightSum));
  const drift = round2(totalAmount - shares.reduce((a, b) => a + b, 0));
  shares[shares.length - 1] = round2((shares.at(-1) ?? 0) + drift);
  return items.map((it, i) => {
    const share = shares[i];
    return { unitPrice: it.quantity > 0 ? round2(share / it.quantity) : 0, totalPrice: share, priceSource: 'allocated' };
  });
}

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

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ message: 'items is required' }, { status: 400 });
  }

  const id = randomUUID();
  const strategy: AllocationStrategy = body.allocationStrategy ?? 'manual_partial';
  const currency = body.currency ?? 'USD';
  const totalAmount = round2(body.totalAmount ?? 0);
  const purchasedAt = body.purchasedAt ?? new Date().toISOString();
  const storeName = body.storeName ?? null;
  const storeId = body.storeId ?? null;
  const now = new Date().toISOString();

  // Resolve items
  const resolved: ResolvedItem[] = body.items.map((item) => {
    const manual = normalizeManual(item);
    return {
      productId: item.productId,
      quantity: item.quantity,
      manualUnitPrice: manual.unitPrice,
      manualTotalPrice: manual.totalPrice,
    };
  });

  // Allocate prices
  const allocations: Allocation[] =
    strategy === 'none' || totalAmount > 0
      ? allocate(resolved, totalAmount, strategy)
      : resolved.map((it) => ({
          unitPrice: it.manualUnitPrice,
          totalPrice: it.manualTotalPrice,
          priceSource: it.manualUnitPrice === null ? 'unknown' : 'manual',
        }));

  // Create trip
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
  await sql`
    UPDATE products
    SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ANY(${productIds}::uuid[])
      AND user_id = ${user.userId}
  `;

  const tripRows = await sql`SELECT * FROM shopping_trips WHERE id = ${id} LIMIT 1`;
  return NextResponse.json({ trip: tripRows[0], items: allocations }, { status: 201 });
}

