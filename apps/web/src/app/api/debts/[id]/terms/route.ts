import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { saveCreditTerms } from '@/lib/debt-data';
import { leerCondiciones } from '@/lib/condiciones-credito';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/debts/[id]/terms — las condiciones del banco de la cuenta de esta
 * deuda: su tarjeta entera o ella sola (ver condiciones-credito.ts).
 *
 * Devuelve todas las deudas: cambiar la regla del mínimo cambia la cuota y el
 * plazo de lo que se proyecta, y la pantalla lo vuelve a pintar de una.
 */
export async function PUT(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ message: 'Deuda no encontrada' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const leido = leerCondiciones(body);
  if ('error' in leido) return NextResponse.json({ message: leido.error }, { status: 422 });

  try {
    const result = await saveCreditTerms(user.userId, id, leido);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json(result.snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:terms]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
