import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

async function findProduct(id: string, userId: string, householdId: string | null) {
  let rows;
  if (householdId) {
    rows = await sql`SELECT * FROM products WHERE id = ${id} AND household_id = ${householdId} LIMIT 1`;
  } else {
    rows = await sql`SELECT * FROM products WHERE id = ${id} AND user_id = ${userId} AND household_id IS NULL LIMIT 1`;
  }
  return rows[0] ?? null;
}

// GET /api/products/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const householdId = await getUserHousehold(user.userId);
  const product = await findProduct(id, user.userId, householdId);
  if (!product) return notFound();
  return NextResponse.json(product);
}

// PATCH /api/products/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const householdId = await getUserHousehold(user.userId);
  const product = await findProduct(id, user.userId, householdId);
  if (!product) return notFound();

  const body = await request.json() as Record<string, unknown>;

  const rows = await sql`
    UPDATE products SET
      name = COALESCE(${body.name as string ?? null}, name),
      description = COALESCE(${body.description as string ?? null}, description),
      photo_url = COALESCE(${body.photoUrl as string ?? null}, photo_url),
      category = COALESCE(${body.category as string ?? null}, category),
      current_quantity = COALESCE(${body.currentQuantity as number ?? null}, current_quantity),
      min_quantity = COALESCE(${body.minQuantity as number ?? null}, min_quantity),
      unit = COALESCE(${body.unit as string ?? null}, unit),
      stock_level = COALESCE(${body.stockLevel as string ?? null}, stock_level),
      is_running_low = COALESCE(${body.isRunningLow as boolean ?? null}, is_running_low),
      needs_shopping = COALESCE(${body.needsShopping as boolean ?? null}, needs_shopping),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

// DELETE /api/products/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const householdId = await getUserHousehold(user.userId);
  const product = await findProduct(id, user.userId, householdId);
  if (!product) return notFound();

  await sql`DELETE FROM products WHERE id = ${id}`;
  return new NextResponse(null, { status: 204 });
}
