import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapGoalRow } from '@/lib/finance-data';
import { MAX_GOAL_PRIORITY } from '@/lib/finance-input';

/** Formato UUID: filtra basura antes de que Postgres tenga que rechazarla. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/finance/goals/reorder — guarda el orden de las metas.
 *
 * El cuerpo es la lista de ids TAL COMO quedó en pantalla; la posición de cada
 * uno pasa a ser su `priority`. No es un dato cosmético: el motor reparte el
 * dinero por prioridad, así que arrastrar una meta arriba la pone a cobrar
 * primero.
 *
 * Se escribe en UNA sentencia con `unnest` en vez de un UPDATE por meta: si
 * algo falla, el orden no queda a medio aplicar.
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'Hace falta la lista de metas' }, { status: 422 });
  }
  if (raw.length > MAX_GOAL_PRIORITY) {
    return NextResponse.json({ error: 'Demasiadas metas' }, { status: 422 });
  }

  const ids = raw.filter((v): v is string => typeof v === 'string' && UUID.test(v));
  if (ids.length !== raw.length) {
    return NextResponse.json({ error: 'La lista trae metas inválidas' }, { status: 422 });
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'La lista trae metas repetidas' }, { status: 422 });
  }

  await ensureFinanceSchema();

  // `user_id` en el WHERE: aunque llegue el id de una meta ajena, no se toca.
  const positions = ids.map((_, i) => i + 1);
  await sql`
    UPDATE finance_goals AS g
    SET priority = v.pos, updated_at = NOW()
    FROM unnest(${ids}::uuid[], ${positions}::int[]) AS v(id, pos)
    WHERE g.id = v.id AND g.user_id = ${user.userId}
  `;

  const rows = await sql`
    SELECT * FROM finance_goals
    WHERE user_id = ${user.userId}
    ORDER BY priority ASC, target_date ASC NULLS LAST, created_at ASC
  `;
  return NextResponse.json(rows.map((r) => mapGoalRow(r as Record<string, unknown>)));
}
