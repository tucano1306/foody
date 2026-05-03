import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

// PATCH /api/products/[id]/stock-level
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json() as { level: 'full' | 'half' | 'empty' };
  const level = body.level;

  const isRunningLow = level !== 'full';
  const needsShopping = level === 'empty';

  // Per-user isolation: only the owner of the product can change its stock.
  const rows = await sql`
    UPDATE products SET stock_level = ${level}, is_running_low = ${isRunningLow}, needs_shopping = ${needsShopping}, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (!rows.length) return notFound();

  if (level === 'full') {
    await sql`DELETE FROM shopping_list_items WHERE product_id = ${id} AND user_id = ${user.userId}`;
  } else {
    await sql`
      INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
      VALUES (gen_random_uuid(), ${id}, ${user.userId}, NULL, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json(rows[0]);
}
