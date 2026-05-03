import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

// PATCH /api/products/[id]/mark-ok
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  // Per-user isolation
  const rows = await sql`
    UPDATE products SET stock_level = 'full', is_running_low = false, needs_shopping = false, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId} RETURNING *
  `;
  if (!rows.length) return notFound();

  await sql`DELETE FROM shopping_list_items WHERE product_id = ${id} AND user_id = ${user.userId}`;

  return NextResponse.json(rows[0]);
}
