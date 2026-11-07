// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Recuperar de la papelera. La sentencia vive en `restaurarDeLaPapelera`;
 * aquí, que un id inválido no llegue a la base, que lo ajeno sea un 404 y que
 * un fallo de la base no enseñe sus tripas.
 */

const restaurarDeLaPapelera = vi.fn();
vi.mock('@/lib/debt-data', () => ({
  restaurarDeLaPapelera: (...a: unknown[]) => restaurarDeLaPapelera(...a),
}));
let logueado = true;
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => (logueado ? { userId: 'u1' } : null),
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: (m: string) => Response.json({ message: m }, { status: 404 }),
}));

const { POST } = await import('./route');

const ID = '22222222-2222-4222-8222-222222222222';

function recuperar(id: string) {
  return POST(new NextRequest(`http://localhost/api/debts/${id}/restore`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  restaurarDeLaPapelera.mockReset();
  logueado = true;
});

describe('POST /api/debts/[id]/restore', () => {
  it('sin sesión, 401', async () => {
    logueado = false;
    expect((await recuperar(ID)).status).toBe(401);
    expect(restaurarDeLaPapelera).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 404 sin tocar la base', async () => {
    expect((await recuperar("x' OR 1=1")).status).toBe(404);
    expect(restaurarDeLaPapelera).not.toHaveBeenCalled();
  });

  it('recupera y dice cuántas volvieron (una tarjeta trae sus tramos)', async () => {
    restaurarDeLaPapelera.mockResolvedValue(3);
    const res = await recuperar(ID);
    expect(res.status).toBe(200);
    expect(restaurarDeLaPapelera).toHaveBeenCalledWith('u1', ID);
    expect(await res.json()).toEqual({ recuperadas: 3 });
  });

  it('lo que no está en la papelera del usuario es 404', async () => {
    restaurarDeLaPapelera.mockResolvedValue(0);
    expect((await recuperar(ID)).status).toBe(404);
  });

  it('si la base falla, 500 sin filtrar el error interno', async () => {
    restaurarDeLaPapelera.mockRejectedValue(new Error('password authentication failed for neondb_owner'));
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await recuperar(ID);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('neondb_owner');
    errores.mockRestore();
  });
});
