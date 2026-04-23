import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

function scopeWhere(userId: string, householdId: string | null | undefined) {
  if (householdId) return sql`household_id = ${householdId}`;
  return sql`user_id = ${userId} AND household_id IS NULL`;
}

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

// GET /api/products
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const householdId = await getUserHousehold(user.userId);
  const runningLow = request.nextUrl.searchParams.get('runningLow') === 'true';

  let rows;
  if (runningLow) {
    if (householdId) {
      rows = await sql`
        SELECT * FROM products
        WHERE household_id = ${householdId} AND (needs_shopping = true OR is_running_low = true)
        ORDER BY name ASC
      `;
    } else {
      rows = await sql`
        SELECT * FROM products
        WHERE user_id = ${user.userId} AND household_id IS NULL AND (needs_shopping = true OR is_running_low = true)
        ORDER BY name ASC
      `;
    }
  } else {
    if (householdId) {
      rows = await sql`SELECT * FROM products WHERE household_id = ${householdId} ORDER BY name ASC`;
    } else {
      rows = await sql`SELECT * FROM products WHERE user_id = ${user.userId} AND household_id IS NULL ORDER BY name ASC`;
    }
  }
  return NextResponse.json(rows);
}

// POST /api/products
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const householdId = await getUserHousehold(user.userId);
  const body = await request.json() as {
    name: string;
    description?: string;
    photoUrl?: string;
    category?: string;
    currentQuantity?: number;
    minQuantity?: number;
    unit?: string;
    needsShopping?: boolean;
    isRunningLow?: boolean;
  };

  const id = randomUUID();
  const currentQty = body.currentQuantity ?? 0;
  const minQty = body.minQuantity ?? 1;
  const needsShopping = body.needsShopping ?? false;
  const isRunningLow = body.isRunningLow ?? false;
  const stockLevel = isRunningLow ? 'half' : needsShopping ? 'empty' : 'full';

  const rows = await sql`
    INSERT INTO products (
      id, name, description, photo_url, category,
      current_quantity, min_quantity, unit,
      stock_level, is_running_low, needs_shopping,
      user_id, household_id,
      created_at, updated_at
    ) VALUES (
      ${id}, ${body.name}, ${body.description ?? null}, ${body.photoUrl ?? null}, ${body.category ?? null},
      ${currentQty}, ${minQty}, ${body.unit ?? 'units'},
      ${stockLevel}, ${isRunningLow}, ${needsShopping},
      ${user.userId}, ${householdId},
      NOW(), NOW()
    ) RETURNING *
  `;

  // Add to shopping list if needed
  if (needsShopping || isRunningLow) {
    const listId = randomUUID();
    await sql`
      INSERT INTO shopping_list_items (id, product_id, user_id, household_id, added_at)
      VALUES (${listId}, ${id}, ${user.userId}, ${householdId}, NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json(rows[0], { status: 201 });
}
