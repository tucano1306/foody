import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';

/* ── Guard: only available outside production ─────────────────────────────── */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const uid = session.userId;

  /* ── 1. Clean previous seed data (idempotent) ──────────────────────────── */
  await sql`DELETE FROM product_purchases WHERE user_id = ${uid}`;
  await sql`DELETE FROM shopping_trips      WHERE user_id = ${uid}`;
  await sql`DELETE FROM shopping_list_items WHERE user_id = ${uid}`;
  await sql`DELETE FROM payment_records     WHERE user_id = ${uid}`;
  await sql`DELETE FROM monthly_payments    WHERE user_id = ${uid}`;
  await sql`DELETE FROM stores              WHERE user_id = ${uid}`;
  await sql`DELETE FROM products            WHERE user_id = ${uid}`;

  /* ── 2. Products ──────────────────────────────────────────────────────── */
  const products = [
    { id: 'seed-prod-0001', name: 'Leche',          category: 'lácteos',    unit: 'L',    qty: 0,   min: 2,   stock: 'empty', low: false, needs: true,  price: 22 },
    { id: 'seed-prod-0002', name: 'Pan integral',    category: 'panadería',  unit: 'pza',  qty: 0.5, min: 1,   stock: 'half',  low: true,  needs: false, price: 45 },
    { id: 'seed-prod-0003', name: 'Detergente',      category: 'limpieza',   unit: 'bote', qty: 1,   min: 1,   stock: 'full',  low: false, needs: false, price: 68 },
    { id: 'seed-prod-0004', name: 'Manzanas',        category: 'frutas',     unit: 'kg',   qty: 0,   min: 1,   stock: 'empty', low: false, needs: true,  price: 35 },
    { id: 'seed-prod-0005', name: 'Arroz',           category: 'abarrotes',  unit: 'kg',   qty: 0.5, min: 1,   stock: 'half',  low: true,  needs: false, price: 28 },
    { id: 'seed-prod-0006', name: 'Aceite de oliva', category: 'abarrotes',  unit: '750ml',qty: 1,   min: 1,   stock: 'full',  low: false, needs: false, price: 89 },
    { id: 'seed-prod-0007', name: 'Huevos',          category: 'lácteos',    unit: 'cartón',qty:0,   min: 1,   stock: 'empty', low: false, needs: true,  price: 55 },
    { id: 'seed-prod-0008', name: 'Pasta',           category: 'abarrotes',  unit: 'pza',  qty: 2,   min: 1,   stock: 'full',  low: false, needs: false, price: 18 },
    { id: 'seed-prod-0009', name: 'Tomates',         category: 'verduras',   unit: 'kg',   qty: 0.3, min: 0.5, stock: 'half',  low: true,  needs: false, price: 24 },
    { id: 'seed-prod-0010', name: 'Yogurt',          category: 'lácteos',    unit: 'pza',  qty: 0,   min: 2,   stock: 'empty', low: false, needs: true,  price: 32 },
    { id: 'seed-prod-0011', name: 'Jabón de cocina', category: 'limpieza',   unit: 'pza',  qty: 1,   min: 1,   stock: 'full',  low: false, needs: false, price: 15 },
    { id: 'seed-prod-0012', name: 'Agua mineral',    category: 'bebidas',    unit: 'pack', qty: 2,   min: 1,   stock: 'full',  low: false, needs: false, price: 48 },
  ];

  for (const p of products) {
    await sql`
      INSERT INTO products (
        id, name, category, unit,
        current_quantity, min_quantity, stock_level, is_running_low, needs_shopping,
        user_id, created_at, updated_at
      ) VALUES (
        ${p.id}, ${p.name}, ${p.category}, ${p.unit},
        ${p.qty}, ${p.min}, ${p.stock}, ${p.low}, ${p.needs},
        ${uid}, NOW(), NOW()
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        stock_level = EXCLUDED.stock_level,
        current_quantity = EXCLUDED.current_quantity,
        updated_at = NOW()
    `;
  }

  /* ── 3. Shopping list (empty + half products) ───────────────────────────── */
  const listItems = [
    { id: 'seed-sli-0001', prodId: 'seed-prod-0001', qty: 2,   cart: false }, // Leche
    { id: 'seed-sli-0002', prodId: 'seed-prod-0004', qty: 1,   cart: false }, // Manzanas
    { id: 'seed-sli-0003', prodId: 'seed-prod-0007', qty: 1,   cart: true  }, // Huevos
    { id: 'seed-sli-0004', prodId: 'seed-prod-0010', qty: 2,   cart: false }, // Yogurt
    { id: 'seed-sli-0005', prodId: 'seed-prod-0002', qty: 1,   cart: true  }, // Pan (half)
    { id: 'seed-sli-0006', prodId: 'seed-prod-0005', qty: 1,   cart: false }, // Arroz (half)
    { id: 'seed-sli-0007', prodId: 'seed-prod-0009', qty: 0.5, cart: true  }, // Tomates (half)
  ];

  for (const item of listItems) {
    await sql`
      INSERT INTO shopping_list_items (
        id, product_id, quantity_needed, is_in_cart, is_purchased, user_id, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.prodId}, ${item.qty}, ${item.cart}, false, ${uid}, NOW(), NOW()
      ) ON CONFLICT (id) DO NOTHING
    `;
  }

  /* ── 4. Stores ──────────────────────────────────────────────────────────── */
  const stores = [
    { id: 'seed-store-0001', name: 'Walmart',  chain: 'Walmart',  color: '#0071CE', icon: '🛒' },
    { id: 'seed-store-0002', name: 'Soriana',  chain: 'Soriana',  color: '#E31837', icon: '🏪' },
    { id: 'seed-store-0003', name: 'Oxxo',     chain: 'Oxxo',     color: '#DA291C', icon: '🏬' },
  ];

  for (const s of stores) {
    await sql`
      INSERT INTO stores (id, name, chain, currency, color, icon, user_id, created_at, updated_at)
      VALUES (${s.id}, ${s.name}, ${s.chain}, 'MXN', ${s.color}, ${s.icon}, ${uid}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;
  }

  /* ── 5. Payments ────────────────────────────────────────────────────────── */
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const payments = [
    { id: 'seed-pay-0001', name: 'Netflix',        amount: 219,  category: 'streaming',  dueDay: 15, notify: 3, paid: false },
    { id: 'seed-pay-0002', name: 'Internet',        amount: 499,  category: 'internet',   dueDay: 5,  notify: 3, paid: true  },
    { id: 'seed-pay-0003', name: 'Renta',           amount: 8500, category: 'rent',       dueDay: 1,  notify: 5, paid: false },
    { id: 'seed-pay-0004', name: 'Spotify',         amount: 99,   category: 'streaming',  dueDay: 20, notify: 3, paid: false },
    { id: 'seed-pay-0005', name: 'Gym',             amount: 600,  category: 'health',     dueDay: 10, notify: 3, paid: true  },
    { id: 'seed-pay-0006', name: 'Seguro de auto',  amount: 1200, category: 'insurance',  dueDay: 25, notify: 5, paid: false },
    { id: 'seed-pay-0007', name: 'Luz',             amount: 450,  category: 'utilities',  dueDay: 8,  notify: 3, paid: false },
  ];

  for (const p of payments) {
    await sql`
      INSERT INTO monthly_payments (
        id, name, amount, currency, due_day, category, is_active,
        notification_days_before, user_id, created_at, updated_at
      ) VALUES (
        ${p.id}, ${p.name}, ${p.amount}, 'MXN', ${p.dueDay}, ${p.category}, true,
        ${p.notify}, ${uid}, NOW(), NOW()
      ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        amount = EXCLUDED.amount,
        updated_at = NOW()
    `;
  }

  /* ── 6. Payment records (for paid payments) ─────────────────────────────── */
  const paidPayments = payments.filter((p) => p.paid);
  for (const p of paidPayments) {
    await sql`
      INSERT INTO payment_records (
        id, payment_id, month, year, paid_at, amount, status, user_id, created_at
      ) VALUES (
        ${'seed-rec-' + p.id}, ${p.id}, ${month}, ${year},
        NOW(), ${p.amount}, 'paid', ${uid}, NOW()
      ) ON CONFLICT DO NOTHING
    `;
  }

  /* ── 7. Shopping trips ──────────────────────────────────────────────────── */
  const trips = [
    { id: 'seed-trip-0001', storeId: 'seed-store-0001', storeName: 'Walmart', amount: 845.5, date: '2026-04-20T15:30:00Z', notes: null },
    { id: 'seed-trip-0002', storeId: 'seed-store-0002', storeName: 'Soriana', amount: 320,   date: '2026-04-10T12:00:00Z', notes: null },
    { id: 'seed-trip-0003', storeId: 'seed-store-0003', storeName: 'Oxxo',    amount: 125,   date: '2026-04-05T09:15:00Z', notes: 'Compra rápida' },
  ];

  for (const t of trips) {
    await sql`
      INSERT INTO shopping_trips (
        id, store_id, store_name, purchased_at, total_amount, currency,
        allocation_strategy, user_id, created_at, updated_at
      ) VALUES (
        ${t.id}, ${t.storeId}, ${t.storeName}, ${t.date}, ${t.amount}, 'MXN',
        'equal', ${uid}, NOW(), NOW()
      ) ON CONFLICT (id) DO NOTHING
    `;
  }

  /* ── 8. Product purchases (per trip) ────────────────────────────────────── */
  const purchases = [
    // Walmart trip
    { id: 'seed-pp-0001', prodId: 'seed-prod-0001', tripId: 'seed-trip-0001', qty: 2,   price: 22,  store: 'Walmart', date: '2026-04-20T15:30:00Z' },
    { id: 'seed-pp-0002', prodId: 'seed-prod-0002', tripId: 'seed-trip-0001', qty: 1,   price: 45,  store: 'Walmart', date: '2026-04-20T15:30:00Z' },
    { id: 'seed-pp-0003', prodId: 'seed-prod-0004', tripId: 'seed-trip-0001', qty: 1.5, price: 35,  store: 'Walmart', date: '2026-04-20T15:30:00Z' },
    { id: 'seed-pp-0004', prodId: 'seed-prod-0003', tripId: 'seed-trip-0001', qty: 1,   price: 68,  store: 'Walmart', date: '2026-04-20T15:30:00Z' },
    { id: 'seed-pp-0005', prodId: 'seed-prod-0005', tripId: 'seed-trip-0001', qty: 1,   price: 28,  store: 'Walmart', date: '2026-04-20T15:30:00Z' },
    // Soriana trip
    { id: 'seed-pp-0006', prodId: 'seed-prod-0001', tripId: 'seed-trip-0002', qty: 2,   price: 21,  store: 'Soriana', date: '2026-04-10T12:00:00Z' },
    { id: 'seed-pp-0007', prodId: 'seed-prod-0009', tripId: 'seed-trip-0002', qty: 1,   price: 24,  store: 'Soriana', date: '2026-04-10T12:00:00Z' },
    { id: 'seed-pp-0008', prodId: 'seed-prod-0010', tripId: 'seed-trip-0002', qty: 2,   price: 32,  store: 'Soriana', date: '2026-04-10T12:00:00Z' },
    // Oxxo trip
    { id: 'seed-pp-0009', prodId: 'seed-prod-0012', tripId: 'seed-trip-0003', qty: 1,   price: 48,  store: 'Oxxo',    date: '2026-04-05T09:15:00Z' },
    { id: 'seed-pp-0010', prodId: 'seed-prod-0011', tripId: 'seed-trip-0003', qty: 2,   price: 15,  store: 'Oxxo',    date: '2026-04-05T09:15:00Z' },
  ];

  for (const pp of purchases) {
    await sql`
      INSERT INTO product_purchases (
        id, product_id, trip_id, quantity, unit_price, total_price,
        price_source, currency, store_name, purchased_at, user_id, created_at
      ) VALUES (
        ${pp.id}, ${pp.prodId}, ${pp.tripId}, ${pp.qty}, ${pp.price},
        ${pp.qty * pp.price}, 'manual', 'MXN', ${pp.store}, ${pp.date}, ${uid}, NOW()
      ) ON CONFLICT (id) DO NOTHING
    `;
  }

  return NextResponse.json({
    ok: true,
    seeded: {
      products: products.length,
      shoppingListItems: listItems.length,
      stores: stores.length,
      payments: payments.length,
      paymentRecords: paidPayments.length,
      shoppingTrips: trips.length,
      productPurchases: purchases.length,
    },
  });
}
