// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Quitar del Plan / devolver al Plan. La sentencia vive en `ponerEnElPlan`
 * (debt-data.fuera-del-plan.test.ts prueba que no toca `debts`); aquí, que lo
 * que no es un sí o un no explícito no llegue a la base, que lo ajeno sea un
 * 404 y que un fallo no enseñe sus tripas.
 */

const ponerEnElPlan = vi.fn();
vi.mock('@/lib/debt-data', () => ({
  ponerEnElPlan: (...a: unknown[]) => ponerEnElPlan(...a),
}));
let logueado = true;
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => (logueado ? { userId: 'u1' } : null),
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: (m: string) => Response.json({ message: m }, { status: 404 }),
  badRequest: (m: string) => Response.json({ message: m }, { status: 400 }),
}));

const { PUT } = await import('./route');

const ID = '22222222-2222-4222-8222-222222222222';
const G = '339896bb-13c0-4337-aed2-914c7c099954';

function poner(id: string, cuerpo: string) {
  return PUT(new NextRequest(`http://localhost/api/debts/${id}/plan`, { method: 'PUT', body: cuerpo }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  ponerEnElPlan.mockReset();
  logueado = true;
});

describe('PUT /api/debts/[id]/plan', () => {
  it('sin sesión, 401', async () => {
    logueado = false;
    expect((await poner(ID, '{"enPlan":false}')).status).toBe(401);
    expect(ponerEnElPlan).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 404 sin tocar la base', async () => {
    expect((await poner("x' OR 1=1", '{"enPlan":false}')).status).toBe(404);
    expect(ponerEnElPlan).not.toHaveBeenCalled();
  });

  it('JSON roto es 400', async () => {
    expect((await poner(ID, '{enPlan')).status).toBe(400);
    expect(ponerEnElPlan).not.toHaveBeenCalled();
  });

  it.each([['{}'], ['{"enPlan":"false"}'], ['{"enPlan":0}'], ['null'], ['{"enPlan":null}']])(
    'sin un sí o un no de verdad (%s) es 422: un "false" de texto no quita nada',
    async (cuerpo) => {
      expect((await poner(ID, cuerpo)).status).toBe(422);
      expect(ponerEnElPlan).not.toHaveBeenCalled();
    },
  );

  it('quita la cuenta y dice cuál', async () => {
    ponerEnElPlan.mockResolvedValue(G);
    const res = await poner(ID, '{"enPlan":false}');
    expect(res.status).toBe(200);
    expect(ponerEnElPlan).toHaveBeenCalledWith('u1', ID, false);
    expect(await res.json()).toEqual({ clave: G, enPlan: false });
  });

  it('la devuelve', async () => {
    ponerEnElPlan.mockResolvedValue(G);
    const res = await poner(ID, '{"enPlan":true}');
    expect(ponerEnElPlan).toHaveBeenCalledWith('u1', ID, true);
    expect(await res.json()).toEqual({ clave: G, enPlan: true });
  });

  it('una deuda ajena o en la papelera es 404', async () => {
    ponerEnElPlan.mockResolvedValue(null);
    expect((await poner(ID, '{"enPlan":false}')).status).toBe(404);
  });

  it('si la base falla, 500 sin filtrar el error interno', async () => {
    ponerEnElPlan.mockRejectedValue(new Error('password authentication failed for neondb_owner'));
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await poner(ID, '{"enPlan":false}');
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('neondb_owner');
    errores.mockRestore();
  });
});
