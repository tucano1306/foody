import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureListSkipSchema } from '@/lib/ensure-schema';
import { SKIP_HOURS } from '@/lib/shopping-list-sync';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json() as { note?: string; checked?: boolean };

  const rows = await sql`
    UPDATE shopping_list_items SET
      note = COALESCE(${body.note ?? null}, note),
      checked = COALESCE(${body.checked ?? null}, checked)
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

/**
 * «No estaba en el súper — quitar de la lista».
 *
 * La promesa, escrita en el propio aviso: se quita de la lista «de hoy» y
 * «seguirá en tu despensa como faltante». Borrar la fila cumplía lo segundo y
 * rompía lo primero: no era de hoy, era para siempre. Casa lo seguía contando
 * como faltante y Súper no volvía a enseñarlo nunca.
 *
 * Así que si el producto falta de verdad, la fila se queda y se aparta
 * (`skipped_until`): vuelve al cerrar la compra, o pasadas unas horas si nadie
 * la cierra. Si NO falta —un producto lleno que se añadió a mano—, no hay nada
 * que recordar y la fila se borra como siempre.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  await ensureListSkipSchema();
  const apartada = await sql`
    UPDATE shopping_list_items sli
       SET skipped_until = NOW() + make_interval(hours => ${SKIP_HOURS}::int),
           is_in_cart    = false,
           updated_at    = NOW()
      FROM products p
     WHERE sli.id = ${id} AND sli.user_id = ${user.userId}
       AND p.id = sli.product_id
       AND p.stock_level IN ('empty', 'half')
    RETURNING sli.id
  `;
  if (apartada.length) return new NextResponse(null, { status: 204 });

  const rows = await sql`DELETE FROM shopping_list_items WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
