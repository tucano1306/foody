import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapIncomeRow } from '@/lib/finance-data';
import { isError, validateIncomeBody } from '@/lib/finance-input';

// GET /api/finance/income
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  await ensureFinanceSchema();
  const rows = await sql`
    SELECT * FROM finance_income_sources WHERE user_id = ${user.userId} ORDER BY created_at ASC
  `;
  return NextResponse.json(rows.map((r) => mapIncomeRow(r as Record<string, unknown>)));
}

// POST /api/finance/income
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const input = validateIncomeBody(body);
  if (isError(input)) return NextResponse.json(input, { status: 422 });

  await ensureFinanceSchema();
  const rows = await sql`
    INSERT INTO finance_income_sources (id, user_id, name, amount, frequency, is_active, note, created_at, updated_at)
    VALUES (${randomUUID()}, ${user.userId}, ${input.name}, ${input.amount}, ${input.frequency}, ${input.isActive}, ${input.note}, NOW(), NOW())
    RETURNING *
  `;
  return NextResponse.json(mapIncomeRow(rows[0] as Record<string, unknown>), { status: 201 });
}
