import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { findAccessibleProduct } from '@/lib/product-access';

// GET /api/products/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await findAccessibleProduct(id, user.userId);
  if (!access) return notFound();
  return NextResponse.json(access.product);
}

// PATCH /api/products/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  // Household members may edit a product shared with them, not only its owner.
  const access = await findAccessibleProduct(id, user.userId);
  if (!access) return notFound();

  const body = await request.json() as Record<string, unknown>;

  // Treat empty string as null so a missing photo never clears an existing one
  const newPhotoUrl = typeof body.photoUrl === 'string' && body.photoUrl ? body.photoUrl : null;

  // Sharing controls. `is_private` is only touched when the client sends a
  // boolean (COALESCE with null → keep current). Saving also adopts the
  // product into the owner's current household namespace, so toggling a legacy
  // product to "Compartido" actually makes it visible to household members.
  // Only the owner decides those two: a member editing a shared product must
  // not be able to unshare it or move it to another household.
  const isPrivate = access.isOwner && typeof body.isPrivate === 'boolean' ? body.isPrivate : null;
  const householdId = access.isOwner
    ? await getUserHouseholdId(user.userId)
    : (access.product.household_id as string | null);

  const rows = await sql`
    UPDATE products SET
      name = COALESCE(${body.name as string ?? null}, name),
      description = COALESCE(${body.description as string ?? null}, description),
      photo_url = COALESCE(${newPhotoUrl}, photo_url),
      category = COALESCE(${body.category as string ?? null}, category),
      current_quantity = COALESCE(${body.currentQuantity as number ?? null}, current_quantity),
      min_quantity = COALESCE(${body.minQuantity as number ?? null}, min_quantity),
      unit = COALESCE(${body.unit as string ?? null}, unit),
      stock_level = COALESCE(${body.stockLevel as string ?? null}, stock_level),
      is_running_low = COALESCE(${body.isRunningLow as boolean ?? null}, is_running_low),
      needs_shopping = COALESCE(${body.needsShopping as boolean ?? null}, needs_shopping),
      is_private = COALESCE(${isPrivate}, is_private),
      household_id = ${householdId},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  // Restocking via a general edit must also clear the shopping list, same as
  // the dedicated stock-level/mark-ok endpoints. Only my own list row is
  // touched — each member keeps their own shopping list.
  if (body.stockLevel === 'full') {
    await sql`DELETE FROM shopping_list_items WHERE product_id = ${id} AND user_id = ${user.userId}`;
  }

  return NextResponse.json(rows[0]);
}

// DELETE /api/products/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await findAccessibleProduct(id, user.userId);
  if (!access) return notFound();
  // Destructive: a shared product can only be deleted by its owner.
  if (!access.isOwner) {
    return NextResponse.json(
      { message: 'Solo el dueño puede eliminar este producto compartido' },
      { status: 403 },
    );
  }

  await sql`DELETE FROM products WHERE id = ${id} AND user_id = ${user.userId}`;
  return new NextResponse(null, { status: 204 });
}

async function getUserHouseholdId(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}
