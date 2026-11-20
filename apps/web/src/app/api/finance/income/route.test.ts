// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Un cheque apuntado, corregido, apagado o borrado en el Plan cambia lo que
 * debe estar en Computo, así que las tres rutas avisan. La sincronización corre
 * después de responder y solo para el dueño: eso lo decide
 * `programarSyncComputo`, no la ruta.
 */

let usuario: { userId: string } | null = { userId: 'dueno' };
let filas: Record<string, unknown>[] = [];
const sync = vi.fn();

vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => usuario,
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: () => new Response(null, { status: 404 }),
}));
vi.mock('@/lib/db', () => ({ sql: async () => filas }));
vi.mock('@/lib/finance-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/finance-data')>()),
  ensureFinanceSchema: async () => undefined,
}));
vi.mock('@/lib/computo/programar', () => ({ programarSyncComputo: (u: string) => sync(u) }));

const { POST } = await import('./route');
const { PATCH, DELETE } = await import('./[id]/route');

const URL = 'http://localhost/api/finance/income';
const conId = { params: Promise.resolve({ id: 'i1' }) };
const pedir = (metodo: string, cuerpo?: unknown, url = URL) =>
  new NextRequest(url, { method: metodo, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) });

const CHEQUE = { name: 'Obra', amount: 300, frequency: 'one_time', receivedOn: '2026-11-13' };

beforeEach(() => {
  usuario = { userId: 'dueno' };
  filas = [{ id: 'i1', name: 'Obra', amount: '300', frequency: 'one_time', is_active: true, received_on: '2026-11-13' }];
  sync.mockReset();
});

describe('rutas de ingresos → Computo', () => {
  it('apuntar un cheque lo lleva a Computo', async () => {
    expect((await POST(pedir('POST', CHEQUE))).status).toBe(201);
    expect(sync).toHaveBeenCalledWith('dueno');
  });

  it('un cheque que no se guarda no dispara nada', async () => {
    expect((await POST(pedir('POST', { ...CHEQUE, amount: 0 }))).status).toBe(422);
    expect((await POST(new NextRequest(URL, { method: 'POST', body: '{' }))).status).toBe(400);
    expect(sync).not.toHaveBeenCalled();
  });

  it('apagarlo, corregir la cifra o editarlo entero también', async () => {
    for (const cuerpo of [{ isActive: false }, { amount: 350 }, CHEQUE]) {
      sync.mockReset();
      expect((await PATCH(pedir('PATCH', cuerpo, `${URL}/i1`), conId)).status).toBe(200);
      expect(sync).toHaveBeenCalledWith('dueno');
    }
  });

  it('borrarlo, también: en Computo se borra o se suelta', async () => {
    expect((await DELETE(pedir('DELETE', undefined, `${URL}/i1`), conId)).status).toBe(200);
    expect(sync).toHaveBeenCalledWith('dueno');
  });

  it('sin sesión, 401 y nada que sincronizar', async () => {
    usuario = null;
    expect((await POST(pedir('POST', CHEQUE))).status).toBe(401);
    expect((await PATCH(pedir('PATCH', { isActive: false }, `${URL}/i1`), conId)).status).toBe(401);
    expect((await DELETE(pedir('DELETE', undefined, `${URL}/i1`), conId)).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });
});
