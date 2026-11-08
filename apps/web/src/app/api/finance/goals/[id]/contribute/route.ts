import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapGoalRow } from '@/lib/finance-data';
import { parseAmount } from '@/lib/finance-input';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/finance/goals/:id/contribute  { amount, note? }
 *
 * Registra un aporte (o un retiro, con monto negativo) y actualiza el ahorro
 * de la meta. El saldo nunca baja de 0 ni sube por encima del objetivo… salvo
 * que el usuario aporte de más: eso sí se permite, y la meta queda "lograda".
 *
 * Una meta enganchada a una deuda viva NO acepta aportes (409). Lee lo
 * abonado del saldo de la deuda (`goalWithDebt`), así que el aporte se
 * guardaba, se pisaba en la siguiente carga y la tarjeta seguía igual en
 * Deudas: dinero apuntado que no aparecía en ningún sitio. Ese abono se hace
 * en Deudas, y la meta se mueve sola. Con la deuda en la papelera la meta
 * vuelve a ser suya y acepta aportes, igual que la trata el Plan.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!UUID.test(id)) return notFound('Meta no encontrada');

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

  // La comprobación va DENTRO del UPDATE y no en una lectura previa: así no
  // hay hueco entre «no está enganchada» y escribir.
  const rows = await sql`
    UPDATE finance_goals g
    SET saved_amount = GREATEST(0, g.saved_amount + ${amount}), updated_at = NOW()
    WHERE g.id = ${id} AND g.user_id = ${user.userId}
      AND NOT EXISTS (
        SELECT 1 FROM debts d
         WHERE d.id = g.debt_id AND d.user_id = g.user_id AND d.status <> 'archived'
      )
    RETURNING *
  `;
  if (rows.length === 0) {
    const existe = await sql`SELECT 1 FROM finance_goals WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
    if (existe.length === 0) return notFound('Meta no encontrada');
    return NextResponse.json(
      { error: 'Esta meta sigue a una deuda: el abono se hace en Deudas y la meta se mueve sola' },
      { status: 409 },
    );
  }

  await sql`
    INSERT INTO finance_goal_contributions (goal_id, user_id, amount, note)
    VALUES (${id}, ${user.userId}, ${amount}, ${note})
  `;

  return NextResponse.json(mapGoalRow(rows[0] as Record<string, unknown>));
}
