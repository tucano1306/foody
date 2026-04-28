import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

// PATCH /api/products/[id]/mark-low
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const householdId = await getUserHousehold(user.userId);

  let rows;
  if (householdId) {
    rows = await sql`
      UPDATE products SET stock_level = 'half', is_running_low = true, needs_shopping = true, updated_at = NOW()
      WHERE id = ${id} AND household_id = ${householdId} RETURNING *
    `;
  } else {
    rows = await sql`
      UPDATE products SET stock_level = 'half', is_running_low = true, needs_shopping = true, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId} AND household_id IS NULL RETURNING *
    `;
  }
  if (!rows.length) return notFound();

  // Add to shopping list
  await sql`
    INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
    VALUES (gen_random_uuid(), ${id}, ${user.userId}, ${householdId}, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `;

  return NextResponse.json(rows[0]);
}
