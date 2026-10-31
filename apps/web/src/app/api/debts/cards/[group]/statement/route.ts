import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { movidoDesdeElCierre, saveCardStatement } from '@/lib/debt-data';
import { leerCuadre } from '@/lib/cuadre-tarjeta';

type Ctx = { params: Promise<{ group: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/debts/cards/[group]/statement?closing=YYYY-MM-DD — lo que se movió
 * cada tramo después de ese cierre. Con eso la pantalla de cuadre compara el
 * estado con lo que Foody tenía el día del cierre, y no con lo de hoy, que ya
 * lleva los abonos posteriores.
 */
export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { group } = await params;
  if (!UUID.test(group)) return NextResponse.json({ message: 'Tarjeta no encontrada' }, { status: 404 });
  const closing = request.nextUrl.searchParams.get('closing') ?? '';
  if (!FECHA.test(closing)) return NextResponse.json({ message: 'Falta la fecha de cierre' }, { status: 422 });

  try {
    return NextResponse.json({ movido: await movidoDesdeElCierre(user.userId, group, closing) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:card-statement]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * POST /api/debts/cards/[group]/statement — cuadra la tarjeta con su estado
 * de cuenta: ajusta el saldo de cada tramo, da de alta los que faltaban y
 * guarda el mínimo y su vencimiento (ver cuadre-tarjeta.ts).
 *
 * Devuelve el panorama de deudas entero, ya cuadrado, para que la pantalla
 * enseñe lo asentado y no su propia cuenta.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { group } = await params;
  if (!UUID.test(group)) return NextResponse.json({ message: 'Tarjeta no encontrada' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const cuadre = leerCuadre(body);
  if ('error' in cuadre) return NextResponse.json({ message: cuadre.error }, { status: 422 });

  try {
    const result = await saveCardStatement(user.userId, group, cuadre);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json(result.snapshot, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:card-statement]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
