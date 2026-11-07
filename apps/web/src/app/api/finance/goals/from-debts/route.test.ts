// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La ruta de «Pasar a Metas»: valida y delega. Qué meta propone cada deuda lo
 * prueba deuda-a-meta.test.ts; aquí, que nada raro llegue a la base, que un
 * segundo toque no sea un error, y que una deuda ajena sea un 404.
 */

const crear = vi.fn();
vi.mock('@/lib/finance-data', () => ({
  crearMetasDesdeDeudas: (...a: unknown[]) => crear(...a),
  GOAL_KINDS: ['trip', 'debt', 'project', 'purchase', 'emergency'],
  GOAL_STATUSES: ['active', 'paused', 'done'],
  INCOME_FREQUENCIES: ['monthly'],
}));
let logueado = true;
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => (logueado ? { userId: 'u1' } : null),
  unauthorized: () => new Response(null, { status: 401 }),
}));

const { POST } = await import('./route');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function pasar(cuerpo: unknown) {
  return POST(
    new NextRequest('http://localhost/api/finance/goals/from-debts', {
      method: 'POST',
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    }),
  );
}

beforeEach(() => {
  crear.mockReset();
  logueado = true;
});

describe('POST /api/finance/goals/from-debts', () => {
  it('sin sesión, 401', async () => {
    logueado = false;
    expect((await pasar({ debtIds: [A] })).status).toBe(401);
    expect(crear).not.toHaveBeenCalled();
  });

  it('JSON roto es 400', async () => {
    expect((await pasar('{no')).status).toBe(400);
    expect((await pasar('[1,2]')).status).toBe(400);
  });

  it('un id inválido es 422 y no toca la base', async () => {
    const res = await pasar({ debtIds: [A, "x'; DROP TABLE debts; --"] });
    expect(res.status).toBe(422);
    expect(crear).not.toHaveBeenCalled();
  });

  it('crea: 201 con lo creado, y pasa los ids sin repetidos', async () => {
    crear.mockResolvedValue({ creadas: [{ id: 'g1' }], omitidas: [] });
    const res = await pasar({ debtIds: [A, B, A] });
    expect(res.status).toBe(201);
    expect(crear).toHaveBeenCalledWith('u1', [A, B]);
    expect(await res.json()).toEqual({ creadas: [{ id: 'g1' }], omitidas: [] });
  });

  it('un segundo toque (ya estaban en Metas) es 200, no un error', async () => {
    crear.mockResolvedValue({ creadas: [], omitidas: [{ debtId: A, motivo: 'ya_en_metas' }] });
    const res = await pasar({ debtIds: [A] });
    expect(res.status).toBe(200);
  });

  it('una deuda ajena o inexistente es 404', async () => {
    crear.mockResolvedValue({ creadas: [], omitidas: [{ debtId: A, motivo: 'no_encontrada' }] });
    expect((await pasar({ debtIds: [A] })).status).toBe(404);
  });

  it('si la base falla, 500 con un mensaje que no filtra el error interno', async () => {
    crear.mockRejectedValue(new Error('connection refused at 10.0.0.1'));
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await pasar({ debtIds: [A] });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('10.0.0.1');
    errores.mockRestore();
  });
});
