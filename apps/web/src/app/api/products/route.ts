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
  // Crear un producto que ya existe no abre una ficha nueva: se devuelve la que
  // hay, con el estado de despensa que el usuario acaba de indicar. Antes salían
  // dos «Aguacate» y el historial de precios se repartía entre los dos sin que
  // nada lo dijera; al leer las estadísticas ya era tarde.
  //
  // Se piden solo id y nombre: el `SELECT *` arrastraría `photo_url`, que es la
  // columna que agotó la cuota de Neon, y aquí no se dibuja ninguna imagen.
  const catalogo = await sql`
    SELECT id, name FROM products WHERE user_id = ${user.userId}
  `;
  const repetido = findDuplicate(
    name,
    catalogo.map((row) => ({ id: String(row.id), name: String(row.name ?? '') })),
  );

  if (repetido) {
    const needsShoppingDup = body.needsShopping === true;
    const isRunningLowDup = body.isRunningLow === true;
    const descripcionDup =
      typeof body.description === 'string' ? body.description.slice(0, 1000) : null;
    const fotoDup = typeof body.photoUrl === 'string' ? body.photoUrl : null;
    const categoriaDup = typeof body.category === 'string' ? body.category : null;

    // El estado de stock SÍ se pisa —es lo que el usuario acaba de decir—, pero
    // descripción, foto y categoría solo rellenan huecos: lo que ya había
    // escrito vale más que un formulario a medio llenar.
    const actualizado = await sql`
      UPDATE products
         SET needs_shopping   = ${needsShoppingDup},
             is_running_low   = ${isRunningLowDup},
             stock_level      = ${deriveStockLevel(needsShoppingDup, isRunningLowDup)},
             stock_updated_at = NOW(),
             description      = COALESCE(NULLIF(TRIM(description), ''), ${descripcionDup}),
             photo_url        = COALESCE(photo_url, ${fotoDup}),
             category         = COALESCE(NULLIF(TRIM(category), ''), ${categoriaDup}),
             updated_at       = NOW()
       WHERE id = ${repetido.id} AND user_id = ${user.userId}
       RETURNING *
    `;

    if (needsShoppingDup || isRunningLowDup) {
      await sql`
        INSERT INTO shopping_list_items (id, product_id, user_id, household_id, created_at, updated_at)
        VALUES (${randomUUID()}, ${repetido.id}, ${user.userId}, NULL, NOW(), NOW())
        ON CONFLICT (user_id, product_id) DO NOTHING
      `;
    }

    // 200 y no 201: no se ha creado nada. El cuerpo es el producto, igual que
    // en el camino normal, así que el formulario sigue su curso.
    return NextResponse.json(actualizado[0], { status: 200 });
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
