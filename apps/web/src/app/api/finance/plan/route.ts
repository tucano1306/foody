import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { getFinancePlan } from '@/lib/finance-data';

// GET /api/finance/plan?extra=200 — plan completo (opcionalmente simulado).
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const raw = Number.parseFloat(request.nextUrl.searchParams.get('extra') ?? '0');
  const extra = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 1_000_000) : 0;

  const plan = await getFinancePlan(user.userId, extra);
  return NextResponse.json(plan);
}
