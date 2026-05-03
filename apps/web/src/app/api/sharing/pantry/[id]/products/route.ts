import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound, badRequest } from '@/lib/route-helpers';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/sharing/pantry/[id]/products
 * Returns the owner's products — only if there is an 'accepted' pantry_share
 * where the current user is the guest and the share ID matches.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const { id } = await params;

  // Verify the share exists and is accepted
  const shares = await sql`
    SELECT owner_id FROM pantry_shares
    WHERE id = ${id} AND guest_id = ${user.userId} AND status = 'accepted'
    LIMIT 1
  `;
  if (!shares.length) return notFound('Acceso no autorizado o solicitud no aceptada');
  const { owner_id } = shares[0] as { owner_id: string };

  // Read only: category filter is optional
  const category = request.nextUrl.searchParams.get('category');

  const products = category
    ? await sql`
        SELECT id, name, description, photo_url, category, stock_level, unit,
               current_quantity, min_quantity, is_running_low, needs_shopping
        FROM products
        WHERE user_id = ${owner_id} AND category = ${category}
        ORDER BY name ASC
      `
    : await sql`
        SELECT id, name, description, photo_url, category, stock_level, unit,
               current_quantity, min_quantity, is_running_low, needs_shopping
        FROM products
        WHERE user_id = ${owner_id}
        ORDER BY name ASC
      `;

  const owner = await sql`SELECT name, email, avatar_url FROM users WHERE id = ${owner_id} LIMIT 1`;

  return NextResponse.json({ owner: owner[0] ?? null, products });
}

/**
 * POST /api/sharing/pantry/[id]/products
 * Body: { productId: string }
 * Guest clones one of the owner's products into their own pantry.
 * Requires an accepted share.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const { id } = await params;

  const shares = await sql`
    SELECT owner_id FROM pantry_shares
    WHERE id = ${id} AND guest_id = ${user.userId} AND status = 'accepted'
    LIMIT 1
  `;
  if (!shares.length) return notFound('Acceso no autorizado o solicitud no aceptada');
  const { owner_id } = shares[0] as { owner_id: string };

  const body = await request.json() as { productId?: unknown };
  const productId = typeof body.productId === 'string' ? body.productId : '';
  if (!productId) return badRequest('productId is required');

  // Verify the product belongs to the owner
  const source = await sql`
    SELECT * FROM products WHERE id = ${productId} AND user_id = ${owner_id} LIMIT 1
  `;
  if (!source.length) return notFound('Producto no encontrado');
  const p = source[0] as Record<string, unknown>;

  const { randomUUID } = await import('node:crypto');
  const newId = randomUUID();

  const cloned = await sql`
    INSERT INTO products (
      id, name, description, photo_url, category,
      current_quantity, min_quantity, unit,
      stock_level, is_running_low, needs_shopping,
      user_id, household_id, created_at, updated_at
    ) VALUES (
      ${newId}, ${p.name}, ${p.description ?? null}, ${p.photo_url ?? null}, ${p.category ?? null},
      ${p.current_quantity ?? 0}, ${p.min_quantity ?? 1}, ${p.unit ?? 'units'},
      'full', false, false,
      ${user.userId}, NULL, NOW(), NOW()
    )
    RETURNING *
  `;

  return NextResponse.json(cloned[0], { status: 201 });
}
