import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapGoalRow } from '@/lib/finance-data';
import { isError, validateGoalBody } from '@/lib/finance-input';

// PATCH /api/finance/goals/:id — reemplaza la meta completa (el modal envía todo).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  await ensureFinanceSchema();

  // Atajo para el botón "marcar lograda" / "pausar": solo cambia el estado.
  if (Object.keys(body).length === 1 && typeof body.status === 'string') {
    const status = ['active', 'paused', 'done'].includes(body.status) ? body.status : null;
    if (!status) return NextResponse.json({ error: 'Estado inválido' }, { status: 422 });
    const rows = await sql`
      UPDATE finance_goals SET status = ${status}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId}
      RETURNING *
    `;
    if (rows.length === 0) return notFound('Meta no encontrada');
    return NextResponse.json(mapGoalRow(rows[0] as Record<string, unknown>));
  }

  const input = validateGoalBody(body);
  if (isError(input)) return NextResponse.json(input, { status: 422 });

  const rows = await sql`
    UPDATE finance_goals SET
      name             = ${input.name},
      emoji            = ${input.emoji},
      kind             = ${input.kind},
      target_amount    = ${input.targetAmount},
      saved_amount     = ${input.savedAmount},
      target_date      = ${input.targetDate},
      priority         = ${input.priority},
      monthly_override = ${input.monthlyOverride},
      status           = ${input.status},
      note             = ${input.note},
      updated_at       = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (rows.length === 0) return notFound('Meta no encontrada');
  return NextResponse.json(mapGoalRow(rows[0] as Record<string, unknown>));
}

// DELETE /api/finance/goals/:id
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  await ensureFinanceSchema();
  const rows = await sql`
    DELETE FROM finance_goals WHERE id = ${id} AND user_id = ${user.userId} RETURNING id
  `;
  if (rows.length === 0) return notFound('Meta no encontrada');
  return NextResponse.json({ ok: true });
}
