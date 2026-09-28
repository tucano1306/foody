// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La ruta del abono a una tarjeta con tramos: valida y delega. El reparto lo
 * prueba card-payment.test.ts; aquí, que el mínimo sea obligatorio —sin él no
 * se sabe qué parte va a la tasa más baja— y que no se cuele un grupo inválido
 * hasta el `::uuid` de la consulta.
 */

const registerCardPayment = vi.fn();
vi.mock('@/lib/debt-data', () => ({ registerCardPayment: (...a: unknown[]) => registerCardPayment(...a) }));
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => ({ userId: 'u1' }),
  unauthorized: () => new Response(null, { status: 401 }),
}));

const { POST } = await import('./route');

const GRUPO = '11111111-1111-4111-8111-111111111111';

function abonar(group: string, cuerpo: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/debts/cards/${group}/payments`, {
      method: 'POST',
      body: JSON.stringify(cuerpo),
    }),
    { params: Promise.resolve({ group }) },
  );
}

beforeEach(() => {
  registerCardPayment.mockReset();
});

describe('POST /api/debts/cards/[group]/payments', () => {
  it('un grupo que no es un uuid es 404, sin tocar la base', async () => {
    const res = await abonar("x' OR 1=1", { amount: 156, minimumDue: 156 });
    expect(res.status).toBe(404);
    expect(registerCardPayment).not.toHaveBeenCalled();
  });

  it('sin mínimo no hay reparto: 422', async () => {
    const res = await abonar(GRUPO, { amount: 156 });
    expect(res.status).toBe(422);
    expect(registerCardPayment).not.toHaveBeenCalled();
  });

  it('un monto de cero es 422', async () => {
    const res = await abonar(GRUPO, { amount: 0, minimumDue: 156 });
    expect(res.status).toBe(422);
  });

  it('pasa monto y mínimo al reparto, y devuelve lo que se asentó', async () => {
    registerCardPayment.mockResolvedValue({ ok: true, allocation: { applied: 156 }, debts: [{ id: 'd1' }] });
    const res = await abonar(GRUPO, { amount: 156, minimumDue: 156, paymentMethod: 'transfer' });
    expect(res.status).toBe(201);
    expect(registerCardPayment).toHaveBeenCalledWith('u1', GRUPO, expect.objectContaining({ amount: 156, minimumDue: 156 }));
    expect(await res.json()).toEqual({ allocation: { applied: 156 }, debts: [{ id: 'd1' }] });
  });

  it('pagar más de lo que debe la tarjeta llega como 422 con el motivo', async () => {
    registerCardPayment.mockResolvedValue({ ok: false, status: 422, message: 'Eso es más de lo que debe la tarjeta' });
    const res = await abonar(GRUPO, { amount: 99999, minimumDue: 156 });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/más de lo que debe/);
  });
});
