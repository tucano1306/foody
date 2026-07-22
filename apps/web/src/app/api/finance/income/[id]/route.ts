import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapIncomeRow } from '@/lib/finance-data';
import { isError, validateIncomeBody } from '@/lib/finance-input';

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

  const input = validateIncomeBody(body);
  if (isError(input)) return NextResponse.json(input, { status: 422 });

  const rows = await sql`
    UPDATE finance_income_sources SET
      name = ${input.name},
      amount = ${input.amount},
      frequency = ${input.frequency},
      is_active = ${input.isActive},
      note = ${input.note},
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
