import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { listDebts, setCardGroup } from '@/lib/debt-data';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/debts/[id]/card — mete esta deuda en la tarjeta de otra
 * (`{ withDebtId }`) o la saca (`{ withDebtId: null }`).
 *
 * Devuelve todas las deudas: meter un tramo cambia cómo se agrupan varias a la
 * vez, y la pantalla las vuelve a pintar de una.
 */
export async function PUT(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const withDebtId = body.withDebtId;
  if (!UUID.test(id) || (withDebtId !== null && (typeof withDebtId !== 'string' || !UUID.test(withDebtId)))) {
    return NextResponse.json({ message: 'Deuda no encontrada' }, { status: 404 });
  }

  try {
    const result = await setCardGroup(user.userId, id, withDebtId);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json(await listDebts(user.userId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:card]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
