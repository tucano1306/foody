// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Borrar una tarjeta entera. La sentencia vive en `deleteCard`; aquí, que un
 * grupo inválido no llegue a la base y que una tarjeta ajena sea un 404.
 */

const deleteCard = vi.fn();
vi.mock('@/lib/debt-data', () => ({ deleteCard: (...a: unknown[]) => deleteCard(...a) }));
let logueado = true;
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => (logueado ? { userId: 'u1' } : null),
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: (m: string) => Response.json({ message: m }, { status: 404 }),
}));

const { DELETE } = await import('./route');

const GRUPO = '11111111-1111-4111-8111-111111111111';

function borrar(group: string) {
  return DELETE(new NextRequest(`http://localhost/api/debts/cards/${group}`, { method: 'DELETE' }), {
    params: Promise.resolve({ group }),
  });
}

beforeEach(() => {
  deleteCard.mockReset();
  logueado = true;
});

describe('DELETE /api/debts/cards/[group]', () => {
  it('sin sesión, 401', async () => {
    logueado = false;
    expect((await borrar(GRUPO)).status).toBe(401);
    expect(deleteCard).not.toHaveBeenCalled();
  });

  it('un grupo que no es uuid es 404 sin tocar la base', async () => {
    expect((await borrar("x' OR 1=1")).status).toBe(404);
    expect(deleteCard).not.toHaveBeenCalled();
  });

  it('borra y dice cuántos tramos se fueron', async () => {
    deleteCard.mockResolvedValue(3);
    const res = await borrar(GRUPO);
    expect(res.status).toBe(200);
    expect(deleteCard).toHaveBeenCalledWith('u1', GRUPO);
    expect(await res.json()).toEqual({ borrados: 3 });
  });

  it('una tarjeta que no es del usuario (0 tramos) es 404', async () => {
    deleteCard.mockResolvedValue(0);
    expect((await borrar(GRUPO)).status).toBe(404);
  });

  it('si la base falla, 500 sin filtrar el error interno', async () => {
    deleteCard.mockRejectedValue(new Error('password authentication failed for neondb_owner'));
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await borrar(GRUPO);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('neondb_owner');
    errores.mockRestore();
  });
});
