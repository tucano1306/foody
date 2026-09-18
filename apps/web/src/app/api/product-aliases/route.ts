import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureProductAliasSchema } from '@/lib/ensure-schema';
import { aliasKey } from '@/lib/receipt-match';

/**
 * Los nombres con los que el recibo llama a cada producto del catálogo.
 *
 * Existe porque la despensa está en español y los tickets del súper en inglés:
 * «WATER» no encontraba «Agua», la línea se quedaba sin vincular y sin producto
 * no hay `product_purchase` — ni precio, ni estadística. El diccionario de
 * `product-lexicon.ts` traduce el vocabulario común; esto guarda lo que solo
 * sabe el dueño de la despensa.
 */

// GET /api/product-aliases
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  await ensureProductAliasSchema();

  const rows = await sql`
    SELECT product_id, alias, alias_norm
      FROM product_aliases
     WHERE user_id = ${user.userId}
     ORDER BY updated_at DESC
  `;

  return NextResponse.json(
    rows.map((r) => ({
      productId: String(r.product_id),
      alias: String(r.alias),
      aliasNorm: String(r.alias_norm),
    })),
  );
}

// POST /api/product-aliases  { productId, alias }
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const alias = typeof body.alias === 'string' ? body.alias.trim() : '';

  if (!productId) {
    return NextResponse.json({ message: 'productId is required' }, { status: 422 });
  }
  if (!alias) {
    return NextResponse.json({ message: 'alias is required' }, { status: 422 });
  }
  if (alias.length > 255) {
    return NextResponse.json({ message: 'alias must be 255 characters or fewer' }, { status: 422 });
  }

  // Un alias que al canonizar se queda en nada —«12», «2 LB», puntuación
  // suelta— sería una clave vacía que engancharía con cualquier línea ilegible
  // del siguiente ticket. Mejor no aprenderlo.
  const norm = aliasKey(alias);
  if (!norm) {
    return NextResponse.json(
      { message: 'alias has no matchable content' },
      { status: 422 },
    );
  }

  await ensureProductAliasSchema();

  // El producto tiene que ser suyo: sin esta comprobación, un id ajeno dejaría
  // un alias apuntando a la despensa de otro.
  const propio = await sql`
    SELECT id FROM products WHERE id = ${productId} AND user_id = ${user.userId} LIMIT 1
  `;
  if (propio.length === 0) return notFound('Product not found');

  try {
    const rows = await sql`
      INSERT INTO product_aliases (user_id, product_id, alias, alias_norm)
      VALUES (${user.userId}, ${productId}, ${alias}, ${norm})
      ON CONFLICT (user_id, alias_norm)
      DO UPDATE SET product_id = EXCLUDED.product_id,
                    alias      = EXCLUDED.alias,
                    updated_at = now()
      RETURNING product_id, alias, alias_norm
    `;
    const fila = rows[0];
    return NextResponse.json(
      {
        productId: String(fila.product_id),
        alias: String(fila.alias),
        aliasNorm: String(fila.alias_norm),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
