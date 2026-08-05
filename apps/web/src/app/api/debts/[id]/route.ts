import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { deleteDebt, getDebt, updateDebt } from '@/lib/debt-data';
import { isValidationError, parseUpdateDebt } from '@/lib/debt-input';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/debts/[id] — una deuda con su proyección al día. */
export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  try {
    const debt = await getDebt(user.userId, id);
    return debt ? NextResponse.json(debt) : notFound('Deuda no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:get]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** PATCH /api/debts/[id] — edita los términos del crédito (nunca el saldo). */
export async function PATCH(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const input = parseUpdateDebt(body);
  if (isValidationError(input)) {
    return NextResponse.json({ message: input.error }, { status: input.status });
  }

  try {
    const debt = await updateDebt(user.userId, id, input);
    return debt ? NextResponse.json(debt) : notFound('Deuda no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:update]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** DELETE /api/debts/[id] — borra la deuda y, en cascada, su libro mayor. */
export async function DELETE(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  try {
    const removed = await deleteDebt(user.userId, id);
    return removed ? new NextResponse(null, { status: 204 }) : notFound('Deuda no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:delete]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
