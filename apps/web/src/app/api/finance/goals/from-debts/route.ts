import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { crearMetasDesdeDeudas } from '@/lib/finance-data';
import { isError, parseDebtIdsBody } from '@/lib/finance-input';

/**
 * POST /api/finance/goals/from-debts — «🎯 Pasar a Metas» desde Deudas.
 *
 * Cuerpo: `{ debtIds: string[] }`. Solo ids: el nombre, el objetivo, lo
 * pagado y la fecha los saca el servidor de cada deuda (ver deuda-a-meta.ts).
 *
 * Respuesta: `{ creadas, omitidas }`.
 * - 201 si se creó al menos una meta.
 * - 200 si no hacía falta crear ninguna (ya estaban en Metas, o pagadas): no
 *   es un error, es la respuesta a un segundo toque.
 * - 404 si ninguna de las deudas pedidas es del usuario.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const debtIds = parseDebtIdsBody(body);
  if (isError(debtIds)) return NextResponse.json(debtIds, { status: 422 });

  try {
    const result = await crearMetasDesdeDeudas(user.userId, debtIds);
    if (result.creadas.length === 0 && result.omitidas.every((o) => o.motivo === 'no_encontrada')) {
      return NextResponse.json({ error: 'Deuda no encontrada', ...result }, { status: 404 });
    }
    return NextResponse.json(result, { status: result.creadas.length > 0 ? 201 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[goals:from-debts]', message);
    return NextResponse.json({ error: 'No se pudo pasar a Metas' }, { status: 500 });
  }
}
