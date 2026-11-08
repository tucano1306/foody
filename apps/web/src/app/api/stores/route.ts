import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { leerSucursalNueva } from '@/lib/store-input';
import { crearSucursal, listarTiendas } from '@/lib/stores-data';

/**
 * GET /api/stores — tus tiendas (por nombre, con sus compras), sus sucursales
 * con ubicación y las repetidas que convendría unir.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  return NextResponse.json(await listarTiendas(user.userId));
}

/**
 * POST /api/stores — guarda una sucursal: «📍 Estoy aquí» o un punto del mapa.
 * El nombre se guarda como ya existe («publix» → «Publix»).
 */
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'JSON no válido' }, { status: 400 });
  }
  const lectura = leerSucursalNueva(body);
  if (!lectura.ok) return NextResponse.json({ message: lectura.error }, { status: 422 });

  try {
    return NextResponse.json(await crearSucursal(user.userId, lectura.valor), { status: 201 });
  } catch (err) {
    console.error('[stores] no se pudo crear la sucursal:', err);
    return NextResponse.json({ message: 'No se pudo guardar la tienda' }, { status: 500 });
  }
}
