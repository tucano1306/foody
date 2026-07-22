import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensureFinanceSchema, mapGoalRow } from '@/lib/finance-data';
import { isError, validateGoalBody } from '@/lib/finance-input';

// GET /api/finance/goals
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  await ensureFinanceSchema();
  const rows = await sql`
    SELECT * FROM finance_goals
    WHERE user_id = ${user.userId}
    ORDER BY priority ASC, target_date ASC NULLS LAST, created_at ASC
  `;
  return NextResponse.json(rows.map((r) => mapGoalRow(r as Record<string, unknown>)));
}

// POST /api/finance/goals
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const input = validateGoalBody(body);
  if (isError(input)) return NextResponse.json(input, { status: 422 });

  await ensureFinanceSchema();
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO finance_goals
      (id, user_id, name, emoji, kind, target_amount, saved_amount, target_date, priority, monthly_override, status, note, created_at, updated_at)
    VALUES (
      ${id}, ${user.userId}, ${input.name}, ${input.emoji}, ${input.kind},
      ${input.targetAmount}, ${input.savedAmount}, ${input.targetDate},
      ${input.priority}, ${input.monthlyOverride}, ${input.status}, ${input.note},
      NOW(), NOW()
    )
    RETURNING *
  `;

  // El ahorro inicial se registra como primer aporte para que el historial cuadre.
  if (input.savedAmount > 0) {
    await sql`
      INSERT INTO finance_goal_contributions (goal_id, user_id, amount, note)
      VALUES (${id}, ${user.userId}, ${input.savedAmount}, 'Ahorro inicial')
    `;
  }

  return NextResponse.json(mapGoalRow(rows[0] as Record<string, unknown>), { status: 201 });
}
