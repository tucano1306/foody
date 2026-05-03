import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound, badRequest } from '@/lib/route-helpers';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';
import { randomUUID } from 'node:crypto';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/sharing/gifts/[id]
 * Body: { action: 'accept' | 'decline' | 'cancel' }
 *
 * accept  — recipient only; clones the product into their pantry
 * decline — recipient only; marks gift as declined
 * cancel  — sender only; cancels a pending gift
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const { id } = await params;
  const body = await request.json() as { action?: unknown };
  const action = body.action as string | undefined;

  if (!['accept', 'decline', 'cancel'].includes(action ?? '')) {
    return badRequest('action must be accept, decline, or cancel');
  }

  const rows = await sql`SELECT * FROM product_gifts WHERE id = ${id} LIMIT 1`;
  if (!rows.length) return notFound('Regalo no encontrado');

  const gift = rows[0] as {
    id: string;
    product_id: string;
    sender_id: string;
    recipient_id: string;
    status: string;
  };

  if (gift.status !== 'pending') return badRequest('Este regalo ya fue respondido o cancelado');

  if (action === 'cancel') {
    if (gift.sender_id !== user.userId) return badRequest('Solo el remitente puede cancelar');
    await sql`
      UPDATE product_gifts SET status = 'declined', responded_at = now(), updated_at = now()
      WHERE id = ${id}
    `;
    return NextResponse.json({ message: 'Regalo cancelado' });
  }

  // accept / decline — recipient only
  if (gift.recipient_id !== user.userId) return badRequest('Solo el destinatario puede aceptar o rechazar');

  if (action === 'decline') {
    await sql`
      UPDATE product_gifts SET status = 'declined', responded_at = now(), updated_at = now()
      WHERE id = ${id}
    `;
    return NextResponse.json({ message: 'Regalo rechazado' });
  }

  // action === 'accept' — clone product into recipient's pantry
  const source = await sql`
    SELECT * FROM products WHERE id = ${gift.product_id} LIMIT 1
  `;
  if (!source.length) return notFound('El producto original ya no existe');
  const p = source[0] as Record<string, unknown>;

  const newId = randomUUID();
  const cloned = await sql`
    INSERT INTO products (
      id, name, description, photo_url, category,
      current_quantity, min_quantity, unit,
      stock_level, is_running_low, needs_shopping,
      user_id, household_id, created_at, updated_at
    ) VALUES (
      ${newId},
      ${p.name},
      ${p.description ?? null},
      ${p.photo_url ?? null},
      ${p.category ?? null},
      ${p.current_quantity ?? 0},
      ${p.min_quantity ?? 1},
      ${p.unit ?? 'units'},
      'full', false, false,
      ${user.userId}, NULL, NOW(), NOW()
    )
    RETURNING id
  `;

  const acceptedId = (cloned[0] as { id: string }).id;

  await sql`
    UPDATE product_gifts
    SET status = 'accepted', accepted_product_id = ${acceptedId}, responded_at = now(), updated_at = now()
    WHERE id = ${id}
  `;

  return NextResponse.json({ message: 'Producto añadido a tu despensa', productId: acceptedId });
}
