import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { getDebt } from '@/lib/debt-data';
import { buildSchedule, toMonthlyRate } from '@/lib/debt-engine';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/debts/[id]/schedule — tabla de amortización mes a mes.
 *
 * `?limit=` recorta las filas devueltas (por defecto 60) pero los totales
 * siempre corresponden al crédito COMPLETO, no a la parte visible: si no, un
 * plazo de 30 años parecería costar lo que cuestan sus primeros 5 años.
 */
export async function GET(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const rawLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '60', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 0), 600) : 60;

  try {
    const debt = await getDebt(user.userId, id);
    if (!debt) return notFound('Deuda no encontrada');

    const schedule = buildSchedule({
      balance: debt.currentBalance,
      monthlyRate: toMonthlyRate(debt.rate, debt.ratePeriod),
      payment: debt.projection.installment,
      startDate: new Date(),
      limit,
    });

    return NextResponse.json({
      debtId: debt.id,
      currency: debt.currency,
      installment: debt.projection.installment,
      neverPaysOff: debt.projection.neverPaysOff,
      ...schedule,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:schedule]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
