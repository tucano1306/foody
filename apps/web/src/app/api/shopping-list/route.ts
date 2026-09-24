import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { syncFaltantesToList } from '@/lib/shopping-list-sync';
import { ensureListSkipSchema } from '@/lib/ensure-schema';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomUUID } from 'node:crypto';

// GET /api/shopping-list
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  // Lo mismo que `api.shoppingList.get`: todo faltante tiene fila antes de
  // leer. El hogar hace falta para contar lo mismo que Casa.
  const hogar = await sql`SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1`;
  const householdId = (hogar[0] as { household_id: string | null } | undefined)?.household_id ?? null;
  await syncFaltantesToList(user.userId, householdId);

  // Per-user isolation
  const rows = await sql`
    SELECT sli.*, p.name as product_name, p.unit, p.photo_url, p.category, p.stock_level
    FROM shopping_list_items sli
    LEFT JOIN products p ON sli.product_id = p.id
    WHERE sli.user_id = ${user.userId}
      -- Same rule as api.shoppingList.get: a fully stocked product that isn't
      -- flagged as needed must not appear on the shopping list.
      AND (p.id IS NULL OR p.stock_level <> 'full' OR p.needs_shopping = true)
      -- Apartado con «No estaba en el súper»: fuera hasta cerrar la compra.
      AND (sli.skipped_until IS NULL OR sli.skipped_until <= NOW())
    ORDER BY sli.created_at DESC
  `;
  return NextResponse.json(rows);
}

// POST /api/shopping-list
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const body = await request.json() as { productId: string; note?: string };

  // Si ya hay fila —la más normal: la de un producto apartado con «No estaba
  // en el súper»—, se reactiva y se devuelve ESA. Con `ON CONFLICT DO NOTHING`
  // no se devolvía nada, la ruta contestaba con un id recién inventado que
  // nunca se insertó, el producto no volvía a la lista y el siguiente toque
  // sobre él daba 404.
  await ensureListSkipSchema();
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO shopping_list_items (id, product_id, user_id, household_id, note, created_at, updated_at)
    VALUES (${id}, ${body.productId}, ${user.userId}, NULL, ${body.note ?? null}, NOW(), NOW())
    ON CONFLICT (user_id, product_id) DO UPDATE
      SET skipped_until = NULL, updated_at = NOW()
    RETURNING *
  `;

  // Manual adds must survive the "fully stocked" list filter.
  await sql`
    UPDATE products SET needs_shopping = true, updated_at = NOW()
    WHERE id = ${body.productId} AND user_id = ${user.userId}
  `;

  return NextResponse.json(rows[0] ?? { id }, { status: 201 });
}
