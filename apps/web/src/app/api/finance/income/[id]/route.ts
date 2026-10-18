import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapIncomeRow } from '@/lib/finance-data';
import { isError, parseAmount, validateIncomeBody } from '@/lib/finance-input';

// PATCH /api/finance/income/:id
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

  // Atajo del interruptor "activo": no exige reenviar nombre ni monto.
  if (Object.keys(body).length === 1 && body.isActive != null) {
    const rows = await sql`
      UPDATE finance_income_sources SET is_active = ${Boolean(body.isActive)}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId}
      RETURNING *
    `;
    if (rows.length === 0) return notFound('Ingreso no encontrado');
    return NextResponse.json(mapIncomeRow(rows[0] as Record<string, unknown>));
  }

  // Atajo de «Actualizar» un acumulado: la cifra nueva a día de hoy. Mueve
  // `amount_as_of` aunque el número no cambie: confirmar «sigo llevando esto»
  // es justo lo que vuelve a hacer que cuente este mes.
  if (Object.keys(body).length === 1 && body.amount != null) {
    const amount = parseAmount(body.amount);
    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser un número mayor a 0' }, { status: 422 });
    }
    const rows = await sql`
      UPDATE finance_income_sources SET amount = ${amount}::numeric, amount_as_of = NOW(), updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId}
      RETURNING *
    `;
    if (rows.length === 0) return notFound('Ingreso no encontrado');
    return NextResponse.json(mapIncomeRow(rows[0] as Record<string, unknown>));
  }

  const input = validateIncomeBody(body);
  if (isError(input)) return NextResponse.json(input, { status: 422 });

  const rows = await sql`
    UPDATE finance_income_sources SET
      name = ${input.name},
      amount = ${input.amount},
      frequency = ${input.frequency},
      is_active = ${input.isActive},
      note = ${input.note},
      received_on = ${input.receivedOn},
      -- La cifra es de hoy solo si cambió: renombrar no mueve el acumulado de mes.
      amount_as_of = CASE
        WHEN amount IS DISTINCT FROM ${input.amount}::numeric OR frequency IS DISTINCT FROM ${input.frequency}::text
        THEN NOW() ELSE amount_as_of END,
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (rows.length === 0) return notFound('Ingreso no encontrado');
  return NextResponse.json(mapIncomeRow(rows[0] as Record<string, unknown>));
}

// DELETE /api/finance/income/:id
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  await ensureFinanceSchema();
  const rows = await sql`
    DELETE FROM finance_income_sources WHERE id = ${id} AND user_id = ${user.userId} RETURNING id
  `;
  if (rows.length === 0) return notFound('Ingreso no encontrado');
  return NextResponse.json({ ok: true });
}
