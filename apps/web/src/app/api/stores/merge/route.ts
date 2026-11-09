import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { leerUnion } from '@/lib/store-input';
import { unirTiendas } from '@/lib/stores-data';
import { programarSyncComputo } from '@/lib/computo/programar';
import { revalidateAfterPurchase } from '@/lib/revalidate-purchases';

/**
 * POST /api/stores/merge — `{ variants: ['Cvs', 'CVS Pharmacy'], name: 'CVS' }`.
 *
 * Deja todas esas formas con un solo nombre en tickets, compras sueltas y
 * sucursales. Es lo que hay detrás de «Unir» y de renombrar una tienda.
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
  const lectura = leerUnion(body);
  if (!lectura.ok) return NextResponse.json({ message: lectura.error }, { status: 422 });

  try {
    const resultado = await unirTiendas(user.userId, lectura.valor.variantes, lectura.valor.nombre);
    if (resultado.compras > 0) {
      // La descripción del gasto en Computo es el nombre de la tienda: los
      // tickets renombrados se actualizan allí (misma ref, no se duplican).
      programarSyncComputo(user.userId);
    }
    // Compras, Estadísticas y Casa agrupan por tienda.
    revalidateAfterPurchase();
    return NextResponse.json({ nombre: lectura.valor.nombre, ...resultado });
  } catch (err) {
    console.error('[stores/merge] no se pudo unir:', err);
    return NextResponse.json({ message: 'No se pudieron unir las tiendas' }, { status: 500 });
  }
}
