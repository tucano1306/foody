import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { deleteMovement, updateMovement } from '@/lib/debt-data';
import { parseSignedMoney } from '@/lib/money-input';

type Ctx = { params: Promise<{ id: string; movementId: string }> };

/**
 * DELETE /api/debts/[id]/movements/[movementId] — deshace un movimiento.
 *
 * Para corregirlo sin perderlo está el PATCH de abajo: borrar y volver a crear
 * cambia la fecha, mueve el orden del historial y deja la deuda descuadrada
 * entre las dos acciones.
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

/**
 * PATCH /api/debts/[id]/movements/[movementId] — corrige un movimiento.
 *
 * Importe, nota y fecha. El importe pasa por `parseMoney`, igual que el resto
 * de la app: «128,50» y «128.50» son lo mismo, y un campo vacío significa «no
 * lo toques», no «ponlo a cero».
 */
export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id, movementId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'JSON inválido' }, { status: 400 });
  }

  const patch: { amount?: number; note?: string | null; occurredAt?: Date } = {};

  if (body.amount !== undefined) {
    const amount = parseSignedMoney(body.amount as string | number);
    if (amount === null) {
      return NextResponse.json({ message: 'El importe no es un número válido' }, { status: 400 });
    }
    patch.amount = amount;
  }
  if (body.note !== undefined) {
    patch.note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  }
  if (typeof body.occurredAt === 'string' && body.occurredAt !== '') {
    const when = new Date(body.occurredAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ message: 'La fecha no es válida' }, { status: 400 });
    }
    patch.occurredAt = when;
  }

  try {
    const debt = await updateMovement(user.userId, id, movementId, patch);
    return debt ? NextResponse.json(debt) : notFound('Movimiento no encontrado');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:movement:patch]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
