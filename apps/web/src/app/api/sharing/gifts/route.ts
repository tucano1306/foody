import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, badRequest, notFound } from '@/lib/route-helpers';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';

/**
 * GET /api/sharing/gifts
 * Returns gifts the user sent and gifts received.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const [sent, received] = await Promise.all([
    sql`
      SELECT pg.*, p.name AS product_name, p.photo_url AS product_photo,
             p.category AS product_category, p.unit AS product_unit,
             u.name AS recipient_name, u.email AS recipient_email, u.avatar_url AS recipient_avatar
      FROM product_gifts pg
      JOIN products p ON p.id = pg.product_id
      JOIN users u ON u.id = pg.recipient_id
      WHERE pg.sender_id = ${user.userId}
      ORDER BY pg.created_at DESC
    `,
    sql`
      SELECT pg.*, p.name AS product_name, p.photo_url AS product_photo,
             p.category AS product_category, p.unit AS product_unit,
             u.name AS sender_name, u.email AS sender_email, u.avatar_url AS sender_avatar
      FROM product_gifts pg
      JOIN products p ON p.id = pg.product_id
      JOIN users u ON u.id = pg.sender_id
      WHERE pg.recipient_id = ${user.userId}
      ORDER BY pg.created_at DESC
    `,
  ]);

  return NextResponse.json({ sent, received });
}

/**
 * POST /api/sharing/gifts
 * Body: { productId: string; email: string; message?: string }
 * Sends a product gift invitation to the user identified by email.
 * Does NOT copy the product yet — copy happens on accept.
 */
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const body = await request.json() as { productId?: unknown; email?: unknown; message?: unknown };

  const productId = typeof body.productId === 'string' ? body.productId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!productId) return badRequest('productId is required');
  if (!email) return badRequest('email is required');

  // Verify product belongs to sender
  const products = await sql`SELECT id, name FROM products WHERE id = ${productId} AND user_id = ${user.userId} LIMIT 1`;
  if (!products.length) return notFound('Producto no encontrado');

  // Resolve recipient
  const targets = await sql`SELECT id, name FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  if (!targets.length) return NextResponse.json({ message: `No existe un usuario con el email "${email}"` }, { status: 404 });
  const target = targets[0] as { id: string; name: string };
  if (target.id === user.userId) return badRequest('No puedes enviarte un producto a ti mismo');

  // Prevent duplicate pending gifts of the same product to the same person
  const dup = await sql`
    SELECT id FROM product_gifts
    WHERE product_id = ${productId} AND sender_id = ${user.userId} AND recipient_id = ${target.id} AND status = 'pending'
    LIMIT 1
  `;
  if (dup.length) return badRequest('Ya enviaste este producto a ese usuario y está pendiente de aceptación');

  const rows = await sql`
    INSERT INTO product_gifts (product_id, sender_id, recipient_id, message)
    VALUES (
      ${productId},
      ${user.userId},
      ${target.id},
      ${typeof body.message === 'string' ? body.message.trim() || null : null}
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
