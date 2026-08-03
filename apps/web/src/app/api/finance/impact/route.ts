import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { getFinancePlan } from '@/lib/finance-data';
import { computeExpenseImpact } from '@/lib/goal-impact';

/**
 * GET /api/finance/impact?amount=80 — qué le hace ese gasto a tus metas.
 *
 * Se consulta justo después de registrar una compra, para poder decir "esto
 * retrasa tu viaje 4 días" en vez de dejar que el usuario lo descubra a fin de
 * mes. Solo lee; no modifica nada.
 *
 * Devuelve `impacts: []` —nunca un error— cuando el gasto no afecta a ninguna
 * meta (sin metas, sin ritmo asignado, o absorbido por el dinero sin asignar):
 * quien llama solo tiene que comprobar si hay algo que mostrar.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const raw = Number.parseFloat(request.nextUrl.searchParams.get('amount') ?? '');
  if (!Number.isFinite(raw) || raw <= 0) {
    return NextResponse.json({ impacts: [], worst: null, totalDaysDelayed: 0 });
  }
  const amount = Math.min(raw, 1_000_000);

  const plan = await getFinancePlan(user.userId);
  const result = computeExpenseImpact({
    amount,
    goals: plan.goals,
    unallocatedMonthly: plan.cashFlow.unallocated,
  });

  return NextResponse.json(result);
}
