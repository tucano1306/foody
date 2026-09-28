import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { registerCardPayment } from '@/lib/debt-data';
import { isValidationError, parsePaymentAmount } from '@/lib/debt-input';
import { normalizePaymentMethod } from '@/lib/payment-methods';

type Ctx = { params: Promise<{ group: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/debts/cards/[group]/payments — un abono a la tarjeta entera.
 *
 * El servidor lo reparte entre los tramos como el banco (ver card-payment.ts)
 * y devuelve el reparto con las deudas ya actualizadas, para que la pantalla
 * enseñe exactamente lo que se asentó y no lo que calculó por su cuenta.
 */
export async function POST(request: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { group } = await params;
  if (!UUID.test(group)) return NextResponse.json({ message: 'Tarjeta no encontrada' }, { status: 404 });

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

  // El mínimo es obligatorio: sin él no se sabe qué parte va a la tasa más
  // baja, y adivinarlo repartiría mal justo lo que esta ruta existe para aclarar.
  const minimumDue = typeof body.minimumDue === 'number' ? body.minimumDue : Number.NaN;
  if (!Number.isFinite(minimumDue) || minimumDue < 0) {
    return NextResponse.json({ message: 'Falta el pago mínimo del estado de cuenta' }, { status: 422 });
  }

  const occurredAt = typeof body.occurredAt === 'string' ? new Date(body.occurredAt) : undefined;

  try {
    const result = await registerCardPayment(user.userId, group, {
      amount,
      minimumDue,
      paymentMethod: normalizePaymentMethod(body.paymentMethod),
      note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
      occurredAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined,
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
    return NextResponse.json({ allocation: result.allocation, debts: result.debts }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[debts:card-payment]', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
