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

function deriveStockLevel(needsShopping: boolean, isRunningLow: boolean): 'full' | 'half' | 'empty' {
  if (needsShopping) return 'empty';
  if (isRunningLow) return 'half';
  return 'full';
}

// POST /api/products
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ message: 'name is required' }, { status: 422 });
  }
  if (name.length > 255) {
    return NextResponse.json({ message: 'name must be 255 characters or fewer' }, { status: 422 });
  }

  // Per-user isolation: products are always created as personal (no
  // household sharing). The isPrivate flag is kept for forward compat but
  // has no effect under the per-user model.
  const effectiveHouseholdId = null;

  const id = randomUUID();
  const currentQty = typeof body.currentQuantity === 'number' ? body.currentQuantity : 0;
  const minQty = typeof body.minQuantity === 'number' ? body.minQuantity : 1;
  const needsShopping = body.needsShopping === true;
  const isRunningLow = body.isRunningLow === true;
  const stockLevel = deriveStockLevel(needsShopping, isRunningLow);

  const description = typeof body.description === 'string' ? body.description.slice(0, 1000) : null;
  const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl : null;
  const category = typeof body.category === 'string' ? body.category : null;
  const unit = typeof body.unit === 'string' ? body.unit : 'units';

  try {
    const rows = await sql`
      INSERT INTO products (
        id, name, description, photo_url, category,
        current_quantity, min_quantity, unit,
        stock_level, is_running_low, needs_shopping,
        user_id, household_id,
        created_at, updated_at
      ) VALUES (
        ${id}, ${name}, ${description}, ${photoUrl}, ${category},
        ${currentQty}, ${minQty}, ${unit},
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
