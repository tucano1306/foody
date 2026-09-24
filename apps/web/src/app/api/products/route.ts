import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensureProductSharingSchema } from '@/lib/ensure-schema';
import { findDuplicate } from '@/lib/product-dedupe';
import { randomUUID } from 'node:crypto';

// GET /api/products
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const runningLow = request.nextUrl.searchParams.get('runningLow') === 'true';

  // `?lite=true` — solo lo que necesita un selector de productos.
  //
  // El `SELECT *` de abajo arrastra `photo_url`, que es la columna más pesada
  // con diferencia (base64) y la que agotó la cuota de transferencia de Neon.
  // Un buscador no dibuja ninguna imagen, así que no tiene por qué pagarla.
  if (request.nextUrl.searchParams.get('lite') === 'true') {
    const lite = await sql`
      SELECT id, name, category, unit, last_purchase_price
      FROM products
      WHERE user_id = ${user.userId}
      ORDER BY name ASC
    `;
    return NextResponse.json(lite);
  }

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

  await ensureProductSharingSchema();

  // ── Ya lo tienes ──────────────────────────────────────────────────────────
  // Un nombre que ya está en tu despensa NO se resuelve aquí: se pregunta.
  //
  // Hubo dos respuestas y las dos estaban mal. Al principio se creaba otra
  // ficha sin más, y el catálogo acabó con diez pares con el mismo nombre
  // («Aguacate» dos veces…) que partían el historial de precios en dos; se
  // limpiaron a mano el 18 sep 2026. Después se fusionaba con la existente en
  // silencio —y encima le pisaba el stock—, pero el usuario da de alta el mismo
  // nombre A PROPÓSITO cuando es otra marca: «hay muchas marcas de mantequilla
  // o de huevos». La fusión le borraba la segunda marca sin decírselo.
  //
  // Así que se devuelve 409 con la ficha que ya hay, sin escribir nada, y el
  // formulario le pregunta: ¿otra marca, o la misma? Si dice otra, vuelve con
  // `otraMarca: true` y se crea sin comprobar.
  //
  // Se piden solo id, nombre y foto: el `SELECT *` arrastraría todo, y aquí
  // basta con enseñarle cuál es la que ya tiene.
  if (body.otraMarca !== true) {
    const catalogo = await sql`
      SELECT id, name, photo_url FROM products WHERE user_id = ${user.userId}
    `;
    const repetido = findDuplicate(
      name,
      catalogo.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        photoUrl: (row.photo_url as string | null) ?? null,
      })),
    );

    if (repetido) {
      return NextResponse.json(
        {
          message: 'Ya tienes un producto con ese nombre',
          existing: { id: repetido.id, name: repetido.name, photoUrl: repetido.photoUrl },
        },
        { status: 409 },
      );
    }
  }

  // Household pantry sharing: a product belongs to the creator's household
  // namespace, and `is_private` decides whether other members can see it.
  // Private products (or products created outside a household) stay owner-only.
  const householdRows = await sql`SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1`;
  const effectiveHouseholdId = (householdRows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
  const isPrivate = body.isPrivate === true;

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
        user_id, household_id, is_private,
        created_at, updated_at
      ) VALUES (
        ${id}, ${name}, ${description}, ${photoUrl}, ${category},
        ${currentQty}, ${minQty}, ${unit},
        ${stockLevel}, ${isRunningLow}, ${needsShopping},
        ${user.userId}, ${effectiveHouseholdId}, ${isPrivate},
        NOW(), NOW()
      ) RETURNING *
    `;

    // Add to shopping list if needed
    if (needsShopping || isRunningLow) {
      const listId = randomUUID();
      // Shopping list stays strictly per-user — never scope list rows by household.
      await sql`
        INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
        VALUES (${listId}, ${id}, ${user.userId}, NULL, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
    }

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
