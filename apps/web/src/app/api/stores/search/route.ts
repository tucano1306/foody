import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { leerBusqueda, leerPuntoDeConsulta } from '@/lib/store-input';
import { BuscadorNoDisponible, consultarNominatim, leerResultados, urlDeBusqueda } from '@/lib/osm';

/**
 * GET /api/stores/search?q=publix&lat=26.0&lng=-80.3 — tiendas de
 * OpenStreetMap cerca de ti, la más cercana primero.
 *
 * Solo se llama al pulsar «Buscar», nunca mientras se escribe: la política de
 * Nominatim lo prohíbe (ver lib/osm.ts).
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const params = request.nextUrl.searchParams;
  const q = leerBusqueda(params.get('q'));
  if (!q.ok) return NextResponse.json({ message: q.error }, { status: 422 });
  const centro = leerPuntoDeConsulta(params.get('lat'), params.get('lng'));
  if (!centro.ok) return NextResponse.json({ message: centro.error }, { status: 422 });

  try {
    const datos = await consultarNominatim(urlDeBusqueda(q.valor, centro.valor));
    return NextResponse.json({ resultados: leerResultados(datos, centro.valor) });
  } catch (err) {
    if (err instanceof BuscadorNoDisponible) {
      return NextResponse.json({ message: 'El buscador no responde ahora' }, { status: 502 });
    }
    throw err;
  }
}
