import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { mandarTarjetaAPapelera } from '@/lib/debt-data';

type Ctx = { params: Promise<{ group: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/debts/cards/[group] — manda la tarjeta entera a la papelera:
 * todos sus tramos a la vez. Su libro mayor, sus estados de cuenta, sus
 * condiciones del banco y sus metas se quedan donde están, y vuelven con ella
 * al recuperarla (ver `mandarTarjetaAPapelera`).
 *
 * La confirmación la pide la pantalla; aquí, que un grupo inválido no llegue
 * al `::uuid` de la consulta y que una tarjeta ajena sea un 404.
 */
export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { group } = await params;
  if (!UUID.test(group)) return notFound('Tarjeta no encontrada');

  try {
    const borrados = await mandarTarjetaAPapelera(user.userId, group);
    return borrados > 0 ? NextResponse.json({ borrados }) : notFound('Tarjeta no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:card-delete]', message);
    return NextResponse.json({ message: 'No se pudo borrar la tarjeta' }, { status: 500 });
  }
}
