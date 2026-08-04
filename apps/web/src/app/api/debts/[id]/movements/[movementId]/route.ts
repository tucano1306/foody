import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { deleteMovement } from '@/lib/debt-data';

type Ctx = { params: Promise<{ id: string; movementId: string }> };

/**
 * DELETE /api/debts/[id]/movements/[movementId] — deshace un movimiento.
 *
 * No hay "editar": como el saldo se deriva del libro mayor, borrar la fila y
 * volver a asentarla deja el historial coherente por construcción.
 */
export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id, movementId } = await params;
  try {
    const debt = await deleteMovement(user.userId, id, movementId);
    return debt ? NextResponse.json(debt) : notFound('Movimiento no encontrado');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:movement:delete]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
