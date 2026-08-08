import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, badRequest } from '@/lib/route-helpers';
import { ensureExpenseKindSchema } from '@/lib/ensure-schema';
import { UNITEMIZED_LABEL } from '@/lib/grocery-insights';

/**
 * GET /api/finance/spend-breakdown?category=Lácteos
 *
 * Qué hay DETRÁS de una fila de «En qué se va este mes». La tarjeta del plan
 * enseña un total por categoría; esto devuelve las líneas que lo componen para
 * poder corregirlas, que es lo que convierte el desglose en algo accionable en
 * vez de un dato que solo se mira.
 *
 * Dos formas según la fila, porque son dos cosas distintas:
 *  - una categoría normal → las COMPRAS de productos de esa categoría
 *  - «Sin detallar» → los TICKETS cuyo total ningún producto explica; ahí no
 *    hay líneas que editar, hay recibos a los que les faltan sus productos.
 *
 * Solo lee. Alcance: mes en curso y tickets de super, igual que la tarjeta.
 */

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const category = request.nextUrl.searchParams.get('category')?.trim();
  if (!category) return badRequest('Falta la categoría');

  await ensureExpenseKindSchema();

  // ── «Sin detallar»: tickets a los que les falta el desglose ───────────────
  if (category === UNITEMIZED_LABEL) {
    const rows = await sql`
      SELECT
        t.id,
        t.store_name,
        t.date,
        COALESCE(t.total_spent, 0) AS total,
        COALESCE(SUM(COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0)), 0) AS items_total,
        COUNT(pp.id) AS item_count
      FROM shopping_trips t
      LEFT JOIN product_purchases pp ON pp.trip_id = t.id
      WHERE t.user_id = ${user.userId}
        AND t.kind = 'grocery'
        AND t.date >= DATE_TRUNC('month', NOW())
      GROUP BY t.id, t.store_name, t.date, t.total_spent
      -- El mismo umbral que usa la tarjeta: por debajo de medio dólar el hueco
      -- es redondeo del reparto, no un ticket sin detallar.
      HAVING COALESCE(t.total_spent, 0)
             - COALESCE(SUM(COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0)), 0) >= 0.5
      ORDER BY t.date DESC
    `;

    const trips = (rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      storeName: (r.store_name as string | null) ?? null,
      date: iso(r.date),
      total: num(r.total),
      itemsTotal: num(r.items_total),
      gap: Math.round((num(r.total) - num(r.items_total)) * 100) / 100,
      itemCount: Math.trunc(num(r.item_count)),
    }));

    return NextResponse.json({
      kind: 'unitemized' as const,
      category,
      total: Math.round(trips.reduce((s, t) => s + t.gap, 0) * 100) / 100,
      items: [],
      trips,
    });
  }

  // ── Una categoría normal: las compras que la componen ─────────────────────
  const rows = await sql`
    SELECT
      pp.id,
      pp.product_id,
      p.name AS product_name,
      COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría') AS category,
      pp.quantity,
      pp.unit_price,
      COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0) AS total_price,
      pp.purchased_at,
      pp.store_name,
      pp.trip_id
    FROM product_purchases pp
    JOIN products p ON p.id = pp.product_id
    LEFT JOIN shopping_trips t ON t.id = pp.trip_id
    WHERE pp.user_id = ${user.userId}
      AND (pp.trip_id IS NULL OR t.kind = 'grocery')
      AND pp.purchased_at >= DATE_TRUNC('month', NOW())
      AND COALESCE(NULLIF(TRIM(p.category), ''), 'Sin categoría') = ${category}
    ORDER BY pp.purchased_at DESC, p.name ASC
  `;

  const items = (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    productId: String(r.product_id),
    productName: String(r.product_name ?? 'Producto'),
    category: String(r.category),
    quantity: num(r.quantity),
    unitPrice: r.unit_price == null ? null : num(r.unit_price),
    totalPrice: num(r.total_price),
    purchasedAt: iso(r.purchased_at),
    storeName: (r.store_name as string | null) ?? null,
    tripId: (r.trip_id as string | null) ?? null,
  }));

  return NextResponse.json({
    kind: 'category' as const,
    category,
    total: Math.round(items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100,
    items,
    trips: [],
  });
}
