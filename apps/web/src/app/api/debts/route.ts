import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { createDebt, listDebts } from '@/lib/debt-data';
import { isValidationError, parseCreateDebt } from '@/lib/debt-input';

/** GET /api/debts — deudas del usuario con proyección y vista de cartera. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  try {
    return NextResponse.json(await listDebts(user.userId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:list]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** POST /api/debts — da de alta una deuda con su saldo inicial. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const input = parseCreateDebt(body);
  if (isValidationError(input)) {
    return NextResponse.json({ message: input.error }, { status: input.status });
  }

  try {
    return NextResponse.json(await createDebt(user.userId, input), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:create]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
