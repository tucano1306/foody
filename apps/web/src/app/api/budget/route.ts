import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { getBudgetData, ensureBudgetSchema } from '@/lib/budget-data';

// GET /api/budget
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const data = await getBudgetData(user.userId);
  return NextResponse.json(data);
}

// PATCH /api/budget  { monthlyLimit: number }
export async function PATCH(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: { monthlyLimit?: unknown } = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const rawLimit = body.monthlyLimit;
  if (typeof rawLimit !== 'number' || rawLimit < 0 || !Number.isFinite(rawLimit)) {
    return NextResponse.json({ error: 'monthlyLimit must be a non-negative number' }, { status: 400 });
  }
  const monthlyLimit = Math.round(rawLimit * 100) / 100;

  await ensureBudgetSchema();

  await sql`
    INSERT INTO budget_settings (user_id, monthly_limit, currency, updated_at)
    VALUES (${user.userId}, ${monthlyLimit}, 'USD', NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET monthly_limit = EXCLUDED.monthly_limit,
          updated_at    = NOW()
  `;

  return NextResponse.json({ ok: true, monthlyLimit });
}
