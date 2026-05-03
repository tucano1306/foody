import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

// GET /api/products
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const runningLow = request.nextUrl.searchParams.get('runningLow') === 'true';

  // Per-user isolation: a user only sees products they own, regardless of
  // household membership.
  const rows = runningLow
    ? await sql`
        SELECT * FROM products
        WHERE user_id = ${user.userId} AND (needs_shopping = true OR is_running_low = true)
        ORDER BY name ASC
      `
    : await sql`SELECT * FROM products WHERE user_id = ${user.userId} ORDER BY name ASC`;
  return NextResponse.json(rows);
}

// POST /api/products
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

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
    isPrivate?: boolean;
  };

  // Per-user isolation: products are always created as personal (no
  // household sharing). The isPrivate flag is kept for forward compat but
  // has no effect under the per-user model.
  const effectiveHouseholdId = null;

  const id = randomUUID();
  const currentQty = body.currentQuantity ?? 0;
  const minQty = body.minQuantity ?? 1;
  const needsShopping = body.needsShopping ?? false;
  const isRunningLow = body.isRunningLow ?? false;
  let stockLevel: 'full' | 'half' | 'empty' = 'full';
  if (needsShopping) stockLevel = 'empty';
  if (isRunningLow) stockLevel = 'half';

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
      ${user.userId}, ${effectiveHouseholdId},
      NOW(), NOW()
    ) RETURNING *
  `;

  // Add to shopping list if needed
  if (needsShopping || isRunningLow) {
    const listId = randomUUID();
    await sql`
      INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
      VALUES (${listId}, ${id}, ${user.userId}, ${effectiveHouseholdId}, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json(rows[0], { status: 201 });
}
