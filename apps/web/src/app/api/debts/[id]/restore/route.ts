import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { restaurarDeLaPapelera } from '@/lib/debt-data';

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/debts/[id]/restore — saca una deuda de la papelera, y con ella los
 * tramos de su tarjeta que se borraron en el mismo gesto. Lo usan «Deshacer»,
 * justo después de borrar, y «Recuperar», en la papelera de Deudas.
 *
 * Un id que no es uuid no llega al `::uuid` de la consulta; uno ajeno, o que
 * no está en la papelera, es un 404.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  if (!UUID.test(id)) return notFound('No está en la papelera');

  try {
    const recuperadas = await restaurarDeLaPapelera(user.userId, id);
    return recuperadas > 0 ? NextResponse.json({ recuperadas }) : notFound('No está en la papelera');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:restore]', message);
    return NextResponse.json({ message: 'No se pudo recuperar' }, { status: 500 });
  }
}
