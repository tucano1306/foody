import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  const householdId = await getUserHousehold(user.userId);

  // Inclusive scope: personal + household data
  const productScope = householdId
    ? sql`(household_id = ${householdId} OR (user_id = ${user.userId} AND household_id IS NULL))`
    : sql`user_id = ${user.userId} AND household_id IS NULL`;

  const ppScope = householdId
    ? sql`(pp.household_id = ${householdId} OR (pp.user_id = ${user.userId} AND pp.household_id IS NULL))`
    : sql`pp.user_id = ${user.userId} AND pp.household_id IS NULL`;

  if (type === 'stock') {
    const level = searchParams.get('level') ?? 'full';
    const rows = await sql`
      SELECT id, name, category, current_quantity, unit, stock_level, last_purchase_price
      FROM products
      WHERE ${productScope} AND stock_level = ${level}
      ORDER BY name ASC
      LIMIT 50
    `;
    return NextResponse.json(rows);
  }

  if (type === 'store') {
    const name = searchParams.get('name') ?? '';
    const rows = await sql`
      SELECT pp.id, p.name AS product_name, p.category,
             pp.quantity, pp.unit_price, pp.total_price, pp.currency, pp.purchased_at
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      WHERE ${ppScope}
        AND COALESCE(pp.store_name, 'Sin tienda') = ${name}
      ORDER BY pp.purchased_at DESC
      LIMIT 30
    `;
    return NextResponse.json(rows);
  }

  if (type === 'product') {
    const name = searchParams.get('name') ?? '';
    const rows = await sql`
      SELECT pp.id, pp.quantity, pp.unit_price, pp.total_price, pp.currency,
             pp.purchased_at, COALESCE(pp.store_name, 'Sin tienda') AS store_name
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      WHERE ${ppScope} AND p.name = ${name}
      ORDER BY pp.purchased_at DESC
      LIMIT 30
    `;
    return NextResponse.json(rows);
  }

  if (type === 'month') {
    const month = searchParams.get('month') ?? '';
    const rows = await sql`
      SELECT pp.id, p.name AS product_name, p.category,
             pp.quantity, pp.unit_price, pp.total_price, pp.currency,
             COALESCE(pp.store_name, 'Sin tienda') AS store_name, pp.purchased_at
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      WHERE ${ppScope}
        AND TO_CHAR(pp.purchased_at, 'YYYY-MM') = ${month}
      ORDER BY pp.purchased_at DESC
      LIMIT 50
    `;
    return NextResponse.json(rows);
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
