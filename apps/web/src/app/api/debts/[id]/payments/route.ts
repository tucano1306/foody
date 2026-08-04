import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { registerPayment } from '@/lib/debt-data';
import { isValidationError, parsePaymentAmount } from '@/lib/debt-input';
import { normalizePaymentMethod } from '@/lib/payment-methods';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/debts/[id]/payments — registra un abono.
 *
 * Devuelve el reparto real (comisiones → interés → capital) además de la deuda
 * actualizada, porque enseñar ese desglose es justo el objetivo de la sección:
 * el usuario ve cuánto de su pago bajó la deuda y cuánto se lo llevó el banco.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const amount = parsePaymentAmount(body);
  if (isValidationError(amount)) {
    return NextResponse.json({ message: amount.error }, { status: amount.status });
  }

  const occurredAt = typeof body.occurredAt === 'string' ? new Date(body.occurredAt) : undefined;

  try {
    const result = await registerPayment(user.userId, id, {
      amount,
      paymentMethod: normalizePaymentMethod(body.paymentMethod),
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
      occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined,
    });
    return result ? NextResponse.json(result, { status: 201 }) : notFound('Deuda no encontrada');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:payment]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
