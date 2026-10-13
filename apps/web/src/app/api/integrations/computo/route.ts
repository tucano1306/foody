import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { computoDisponiblePara } from '@/lib/computo/config';
import { programarSyncComputo } from '@/lib/computo/programar';
import { calcularPlan, guardarEnlace, hoyClave, leerEnlace } from '@/lib/computo/sync';
import { CATEGORIA_DE_PAGO, CATEGORIA_DE_TICKET } from '@/lib/computo/mapeo';
import { expenseKindMeta, EXPENSE_KINDS } from '@/lib/expense-kind';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function estado(userId: string) {
  const enlace = await leerEnlace(userId);
  const desde = enlace?.desde ?? hoyClave();
  // Lo pendiente se calcula siempre, también apagado: es lo que se mandaría
  // al encenderlo, y verlo antes es lo que da confianza para hacerlo.
  const plan = await calcularPlan(userId, desde).catch(() => null);
  return {
    disponible: true,
    activo: enlace?.activo ?? false,
    desde,
    empresa: enlace?.empresa ?? null,
    empresaNegocio: enlace?.empresaNegocio ?? null,
    ultimaSync: enlace?.ultimaSync ?? null,
    ultimoError: enlace?.ultimoError ?? null,
    ultimoResumen: enlace?.ultimoResumen ?? null,
    pendientes: plan ? { nuevos: plan.upserts.length, quitar: plan.borrar.length, muestra: plan.upserts.slice(0, 8) } : null,
    categorias: {
      tickets: EXPENSE_KINDS.map((k) => ({ foody: `${k.emoji} ${expenseKindMeta(k.kind).groupLabel}`, computo: CATEGORIA_DE_TICKET[k.kind] })),
      pagos: [...new Set(Object.values(CATEGORIA_DE_PAGO))],
    },
  };
}

/**
 * GET /api/integrations/computo — el estado del enlace, para la hoja de
 * Computo. 404 para cualquiera que no sea el dueño: para los demás usuarios de
 * Foody esto no existe.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  if (!computoDisponiblePara(user.userId)) return notFound();
  return NextResponse.json(await estado(user.userId));
}

/** PUT — encender/apagar y elegir desde qué día se mandan los gastos. */
export async function PUT(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  if (!computoDisponiblePara(user.userId)) return notFound();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const activo = typeof body.activo === 'boolean' ? body.activo : undefined;
  const desde = typeof body.desde === 'string' ? body.desde : undefined;
  if (desde !== undefined && (!FECHA.test(desde) || desde > hoyClave())) {
    return NextResponse.json({ message: 'La fecha tiene que ser de hoy o anterior' }, { status: 422 });
  }

  const enlace = await guardarEnlace(user.userId, { activo, desde });
  // Al encenderlo, o al mover la fecha, se manda lo pendiente sin esperar.
  if (enlace.activo) programarSyncComputo(user.userId);
  return NextResponse.json(await estado(user.userId));
}
