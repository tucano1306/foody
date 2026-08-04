import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { listMovements, registerCharge } from '@/lib/debt-data';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/debts/[id]/movements — el libro mayor de la deuda. */
export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '60', 10);

  try {
    return NextResponse.json(await listMovements(user.userId, id, Number.isFinite(limit) ? limit : 60));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:movements]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * POST /api/debts/[id]/movements — asienta un consumo nuevo, una comisión o un
 * ajuste manual. Es la vía para que la deuda suba sin inventar el saldo a mano.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const kindRaw = typeof body.kind === 'string' ? body.kind : 'charge';
  if (!['charge', 'fee', 'adjustment'].includes(kindRaw)) {
    return NextResponse.json({ message: 'Tipo de movimiento no válido' }, { status: 422 });
  }
  const kind = kindRaw as 'charge' | 'fee' | 'adjustment';

  const amount = typeof body.amount === 'number' ? body.amount : Number.parseFloat(String(body.amount ?? ''));
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ message: 'El monto debe ser distinto de cero' }, { status: 422 });
  }
  // Solo un ajuste puede ir en negativo (para corregir de menos).
  if (amount < 0 && kind !== 'adjustment') {
    return NextResponse.json({ message: 'El monto debe ser mayor que cero' }, { status: 422 });
  }

  try {
    const debt = await registerCharge(user.userId, id, {
      amount,
      kind,
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    });
    return debt ? NextResponse.json(debt, { status: 201 }) : notFound('Deuda no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:charge]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
