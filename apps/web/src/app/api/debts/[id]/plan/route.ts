import { NextRequest, NextResponse } from 'next/server';
import { badRequest, getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { ponerEnElPlan } from '@/lib/debt-data';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/debts/[id]/plan — `{ enPlan: false }` quita del Plan financiero la
 * cuenta de esta deuda (su tarjeta entera, o ella sola); `{ enPlan: true }` la
 * devuelve. En Deudas no cambia nada: ver fuera-del-plan.ts.
 *
 * Un id que no es uuid no llega al `::uuid` de la consulta; uno ajeno, o que
 * está en la papelera, es un 404.
 */
export async function PUT(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return notFound('Deuda no encontrada');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Cuerpo JSON inválido');
  }
  const enPlan = (body as { enPlan?: unknown } | null)?.enPlan;
  if (typeof enPlan !== 'boolean') {
    return NextResponse.json({ message: 'Falta decir si va en el Plan (enPlan: true o false)' }, { status: 422 });
  }

  try {
    const clave = await ponerEnElPlan(user.userId, id, enPlan);
    return clave ? NextResponse.json({ clave, enPlan }) : notFound('Deuda no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:plan]', message);
    return NextResponse.json({ message: 'No se pudo guardar' }, { status: 500 });
  }
}
