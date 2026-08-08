import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound, badRequest } from '@/lib/route-helpers';

/**
 * Editar y borrar una línea de compra suelta.
 *
 * Es lo que hace que el desglose del plan («En qué se va este mes») sirva para
 * algo más que mirar: desde ahí se corrige un importe mal leído por el OCR, se
 * borra una línea que no era, o se mueve un producto de «Sin categoría» a la
 * categoría que le toca.
 *
 * Aislamiento por usuario en TODAS las consultas: el id de una compra es
 * adivinable y sin el `user_id` cualquiera podría tocar la de otro.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface UpdateBody {
  quantity?: unknown;
  totalPrice?: unknown;
  /** Mueve el PRODUCTO a otra categoría (afecta a todas sus compras). */
  category?: unknown;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  let body: UpdateBody = {};
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return badRequest('Cuerpo inválido');
  }

  const existing = await sql`
    SELECT id, product_id, quantity, unit_price, total_price
    FROM product_purchases
    WHERE id = ${id} AND user_id = ${user.userId}
    LIMIT 1
  `;
  if (!existing.length) return notFound();
  const current = existing[0] as Record<string, unknown>;

  // ── Cantidad e importe ────────────────────────────────────────────────────
  const rawQty = body.quantity === undefined ? null : Number(body.quantity);
  if (rawQty !== null && (!Number.isFinite(rawQty) || rawQty <= 0)) {
    return badRequest('La cantidad debe ser mayor que 0');
  }
  const rawTotal = body.totalPrice === undefined ? null : Number(body.totalPrice);
  if (rawTotal !== null && (!Number.isFinite(rawTotal) || rawTotal < 0)) {
    return badRequest('El importe no puede ser negativo');
  }

  if (rawQty !== null || rawTotal !== null) {
    const quantity = rawQty ?? Number(current.quantity ?? 1) ?? 1;
    const totalPrice = rawTotal ?? Number(current.total_price ?? 0);
    // El precio unitario se DERIVA: guardar los tres por separado deja que se
    // contradigan, y el comparador de precios lee el unitario.
    const unitPrice = quantity > 0 ? round2(totalPrice / quantity) : 0;
    await sql`
      UPDATE product_purchases
      SET quantity = ${round2(quantity)},
          total_price = ${round2(totalPrice)},
          unit_price = ${unitPrice},
          price_source = 'manual'
      WHERE id = ${id} AND user_id = ${user.userId}
    `;
  }

  // ── Recategorizar ─────────────────────────────────────────────────────────
  // Cambia el PRODUCTO, no la línea: la categoría es un atributo del producto,
  // así que «Leche» se va a Lácteos para siempre y no solo en este ticket. Es
  // justo lo que quiere quien está vaciando el cajón de «Sin categoría».
  if (typeof body.category === 'string') {
    const category = body.category.trim();
    if (category.length > 60) return badRequest('Categoría demasiado larga');
    await sql`
      UPDATE products
      SET category = ${category === '' ? null : category}, updated_at = NOW()
      WHERE id = ${String(current.product_id)} AND user_id = ${user.userId}
    `;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const rows = await sql`
    DELETE FROM product_purchases
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING id
  `;
  if (!rows.length) return notFound();

  // El total del ticket NO se toca a propósito: es lo que se pagó de verdad.
  // Borrar una línea mal leída del OCR no cambia lo que salió de la cuenta —
  // ese dinero pasa a contarse como «Sin detallar», que es exactamente lo que
  // es hasta que se vincule al producto correcto.
  return new NextResponse(null, { status: 204 });
}
