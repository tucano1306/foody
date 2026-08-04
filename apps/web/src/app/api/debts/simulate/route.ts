import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import {
  buildDebtAdvice,
  buildSchedule,
  projectDebt,
  simulateExtra,
  toMonthlyRate,
  type DebtInput,
} from '@/lib/debt-engine';
import { isValidationError, parseCreateDebt } from '@/lib/debt-input';

/**
 * POST /api/debts/simulate — calculadora sin guardar nada.
 *
 * Acepta el mismo cuerpo que el alta de una deuda y devuelve qué pasaría: la
 * cuota, cuándo se liquida, cuánto interés cuesta y cómo mejora si se abona un
 * extra. Sirve para responder "¿me conviene?" ANTES de comprometerse, y para
 * que cualquier integración externa use exactamente la misma aritmética que la
 * app en vez de reimplementarla.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const parsed = parseCreateDebt(body);
  if (isValidationError(parsed)) {
    return NextResponse.json({ message: parsed.error }, { status: parsed.status });
  }

  const rawExtra = Number(body.simulateExtra ?? 0);
  const extra = Number.isFinite(rawExtra) && rawExtra > 0 ? rawExtra : 0;

  const input: DebtInput = {
    balance: parsed.balance,
    rate: parsed.rate,
    ratePeriod: parsed.ratePeriod ?? 'monthly',
    strategy: parsed.strategy ?? 'fixed_installment',
    termMonths: parsed.termMonths,
    customPayment: parsed.customPayment,
    minPercent: parsed.minPercent,
    minFloor: parsed.minFloor,
    extraMonthly: parsed.extraMonthly,
  };

  const projection = projectDebt(input);
  const schedule = buildSchedule({
    balance: parsed.balance,
    monthlyRate: toMonthlyRate(parsed.rate, parsed.ratePeriod ?? 'monthly'),
    payment: projection.installment,
    startDate: new Date(),
    limit: 12,
  });

  return NextResponse.json({
    currency: parsed.currency ?? 'USD',
    projection,
    schedule,
    advice: buildDebtAdvice(
      { name: parsed.name, balance: parsed.balance, currency: parsed.currency ?? 'USD' },
      projection,
    ),
    withExtra: extra > 0 ? simulateExtra(input, extra) : null,
  });
}
