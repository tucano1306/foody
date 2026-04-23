import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

// GET /api/shopping-list
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);

  let rows;
  if (householdId) {
    rows = await sql`
      SELECT sli.*, p.name as product_name, p.unit, p.photo_url, p.category, p.stock_level
      FROM shopping_list_items sli
      LEFT JOIN products p ON sli.product_id = p.id
      WHERE sli.household_id = ${householdId}
      ORDER BY sli.added_at DESC
    `;
  } else {
    rows = await sql`
      SELECT sli.*, p.name as product_name, p.unit, p.photo_url, p.category, p.stock_level
      FROM shopping_list_items sli
      LEFT JOIN products p ON sli.product_id = p.id
      WHERE sli.user_id = ${user.userId} AND sli.household_id IS NULL
      ORDER BY sli.added_at DESC
    `;
  }
  return NextResponse.json(rows);
}

// POST /api/shopping-list
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const householdId = await getUserHousehold(user.userId);
  const body = await request.json() as { productId: string; note?: string };

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO shopping_list_items (id, product_id, user_id, household_id, note, added_at)
    VALUES (${id}, ${body.productId}, ${user.userId}, ${householdId}, ${body.note ?? null}, NOW())
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  return NextResponse.json(rows[0] ?? { id }, { status: 201 });
}
