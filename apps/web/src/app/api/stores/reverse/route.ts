import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { leerPuntoDeConsulta } from '@/lib/store-input';
import { BuscadorNoDisponible, consultarNominatim, leerInversa, urlInversa } from '@/lib/osm';

/**
 * GET /api/stores/reverse?lat=&lng= — la calle de un punto, para que «📍
 * Estoy aquí» guarde «12800 Biscayne Blvd» y no solo unas coordenadas: con
 * dos Publix, es lo que dice cuál es cuál.
 *
 * Si OSM no responde, la sucursal se guarda igual sin dirección.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const params = request.nextUrl.searchParams;
  const punto = leerPuntoDeConsulta(params.get('lat'), params.get('lng'));
  if (!punto.ok || !punto.valor) return NextResponse.json({ message: 'La ubicación no es válida' }, { status: 422 });

  try {
    return NextResponse.json(leerInversa(await consultarNominatim(urlInversa(punto.valor))));
  } catch (err) {
    if (err instanceof BuscadorNoDisponible) {
      return NextResponse.json({ message: 'El buscador no responde ahora' }, { status: 502 });
    }
    throw err;
  }
}
