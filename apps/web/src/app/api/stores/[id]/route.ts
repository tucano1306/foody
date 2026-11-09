import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { leerCambioDeSucursal } from '@/lib/store-input';
import { actualizarSucursal, borrarSucursal, esUuid, leerSucursal } from '@/lib/stores-data';

type Ctx = { params: Promise<{ id: string }> };

// Un id que no es UUID no puede ser de nadie: 404 sin preguntar a la base,
// que respondería con un error de tipo (500) en vez de «no existe».

export async function GET(request: NextRequest, { params }: Ctx) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!esUuid(id)) return notFound('No existe esa tienda');
  const sucursal = await leerSucursal(user.userId, id);
  return sucursal ? NextResponse.json(sucursal) : notFound('No existe esa tienda');
}

/** PATCH — dirección o ubicación. El nombre se cambia uniendo tiendas. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!esUuid(id)) return notFound('No existe esa tienda');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'JSON no válido' }, { status: 400 });
  }
  const lectura = leerCambioDeSucursal(body);
  if (!lectura.ok) return NextResponse.json({ message: lectura.error }, { status: 422 });

  const sucursal = await actualizarSucursal(user.userId, id, lectura.valor);
  return sucursal ? NextResponse.json(sucursal) : notFound('No existe esa tienda');
}

/** DELETE — quita la ubicación. Las compras de allí se quedan como estaban. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!esUuid(id)) return notFound('No existe esa tienda');
  return (await borrarSucursal(user.userId, id)) ? new NextResponse(null, { status: 204 }) : notFound('No existe esa tienda');
}
