import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

/**
 * PATCH /api/product-purchases/assign-store
 *
 * Assigns a store name to every purchase (and trip) the user has recorded
 * without one — the "Sin tienda" bucket in stats. Legacy scans and completed
 * shopping sessions where the store field was left blank end up there.
 */
export async function PATCH(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: { store?: string } = {};
  try {
    body = (await request.json()) as { store?: string };
  } catch {
    // validated below
  }

  const store = body.store?.trim();
  if (!store || store.length > 60) {
    return NextResponse.json({ message: 'Nombre de tienda inválido' }, { status: 400 });
  }

  const purchases = await sql`
    UPDATE product_purchases
    SET store_name = ${store}
    WHERE user_id = ${user.userId} AND store_name IS NULL
    RETURNING id
  `;
  const trips = await sql`
    UPDATE shopping_trips
    SET store_name = ${store}, updated_at = NOW()
    WHERE user_id = ${user.userId} AND store_name IS NULL
    RETURNING id
  `;

  return NextResponse.json({
    updatedPurchases: purchases.length,
    updatedTrips: trips.length,
  });
}
