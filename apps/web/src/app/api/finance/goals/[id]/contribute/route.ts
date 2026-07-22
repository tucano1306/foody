import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapGoalRow } from '@/lib/finance-data';
import { parseAmount } from '@/lib/finance-input';

/**
 * POST /api/finance/goals/:id/contribute  { amount, note? }
 *
 * Registra un aporte (o un retiro, con monto negativo) y actualiza el ahorro
 * de la meta. El saldo nunca baja de 0 ni sube por encima del objetivo… salvo
 * que el usuario aporte de más: eso sí se permite, y la meta queda "lograda".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const raw = typeof body.amount === 'number' ? body.amount : Number.parseFloat(String(body.amount));
  if (!Number.isFinite(raw) || raw === 0) {
    return NextResponse.json({ error: 'El monto del aporte debe ser distinto de 0' }, { status: 422 });
  }
  const magnitude = parseAmount(Math.abs(raw));
  if (magnitude === null) return NextResponse.json({ error: 'Monto inválido' }, { status: 422 });
  const amount = raw < 0 ? -magnitude : magnitude;

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;

  await ensureFinanceSchema();

  const rows = await sql`
    UPDATE finance_goals
    SET saved_amount = GREATEST(0, saved_amount + ${amount}), updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (rows.length === 0) return notFound('Meta no encontrada');

  await sql`
    INSERT INTO finance_goal_contributions (goal_id, user_id, amount, note)
    VALUES (${id}, ${user.userId}, ${amount}, ${note})
  `;

  return NextResponse.json(mapGoalRow(rows[0] as Record<string, unknown>));
}
