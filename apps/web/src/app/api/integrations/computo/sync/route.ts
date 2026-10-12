import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { computoDisponiblePara } from '@/lib/computo/config';
import { probarConexion, sincronizarComputo } from '@/lib/computo/sync';

/**
 * POST /api/integrations/computo/sync — lo que hacen los botones de la hoja:
 *
 *   { probar: true }   comprueba la conexión y dice en qué empresa se escribe
 *   { simular: true }  vista previa: qué se crearía y qué se enlazaría
 *   {}                 sincronizar ahora
 *
 * Corre dentro de la petición (no en `after`): quien pulsa el botón espera el
 * resultado.
 */
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  if (!computoDisponiblePara(user.userId)) return notFound();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.probar === true) return NextResponse.json(await probarConexion(user.userId));

  const desde = typeof body.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.desde) ? body.desde : undefined;
  const resultado = await sincronizarComputo(user.userId, { simular: body.simular === true, desde });
  const status = resultado.estado === 'error' ? 502 : 200;
  return NextResponse.json(resultado, { status });
}
