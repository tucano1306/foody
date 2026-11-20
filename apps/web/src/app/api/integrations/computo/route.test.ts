// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El enlace con Computo es del dueño: para cualquier otro usuario de Foody la
 * ruta no existe (404), y ninguna de las dos fechas («desde» de los gastos y
 * de los ingresos) puede ser futura.
 */

let usuario: { userId: string } | null = { userId: 'dueno' };
let ingresosDesde: string | null = null;
const guardarEnlace = vi.fn();
const calcularPlan = vi.fn();
const programarSyncComputo = vi.fn();

vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => usuario,
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: () => new Response(null, { status: 404 }),
}));
vi.mock('@/lib/computo/config', () => ({ computoDisponiblePara: (id: string) => id === 'dueno' }));
vi.mock('@/lib/computo/programar', () => ({ programarSyncComputo: (id: string) => programarSyncComputo(id) }));
vi.mock('@/lib/computo/sync', () => ({
  hoyClave: () => '2026-10-11',
  leerEnlace: async () => ({
    activo: true,
    desde: '2026-10-01',
    ingresosDesde,
    empresa: 'Leonardo',
    ultimaSync: null,
    ultimoError: null,
    ultimoResumen: null,
  }),
  guardarEnlace: async (...a: unknown[]) => {
    guardarEnlace(...a);
    return { activo: true, desde: '2026-10-01' };
  },
  calcularPlan: async (...a: unknown[]) => {
    calcularPlan(...a);
    return { upserts: [], borrar: [] };
  },
}));

const { GET, PUT } = await import('./route');

const put = (cuerpo: unknown) =>
  PUT(new NextRequest('http://localhost/api/integrations/computo', { method: 'PUT', body: JSON.stringify(cuerpo) }));

beforeEach(() => {
  usuario = { userId: 'dueno' };
  ingresosDesde = null;
  guardarEnlace.mockReset();
  calcularPlan.mockReset();
  programarSyncComputo.mockReset();
});

describe('/api/integrations/computo', () => {
  it('para otro usuario de Foody no existe', async () => {
    usuario = { userId: 'otra-persona' };
    expect((await GET(new NextRequest('http://localhost/api/integrations/computo'))).status).toBe(404);
    expect((await put({ activo: true })).status).toBe(404);
    expect(guardarEnlace).not.toHaveBeenCalled();
  });

  it('sin sesión, 401', async () => {
    usuario = null;
    expect((await GET(new NextRequest('http://localhost/api/integrations/computo'))).status).toBe(401);
  });

  it('el dueño ve el estado, con las categorías que usará Computo', async () => {
    const res = await GET(new NextRequest('http://localhost/api/integrations/computo'));
    const json = await res.json();
    expect(json).toMatchObject({ disponible: true, activo: true, empresa: 'Leonardo', pendientes: { nuevos: 0, quitar: 0 } });
    expect(json.categorias.tickets).toContainEqual({ foody: '🛒 Súper', computo: 'Supermercado' });
  });

  it('una fecha futura no vale', async () => {
    expect((await put({ desde: '2026-12-01' })).status).toBe(422);
    expect((await put({ desde: 'ayer' })).status).toBe(422);
    expect(guardarEnlace).not.toHaveBeenCalled();
  });

  it('encenderlo guarda y manda lo pendiente sin esperar', async () => {
    const res = await put({ activo: true, desde: '2026-10-01' });
    expect(res.status).toBe(200);
    expect(guardarEnlace).toHaveBeenCalledWith('dueno', { activo: true, desde: '2026-10-01' });
    expect(programarSyncComputo).toHaveBeenCalledWith('dueno');
  });

  it('el estado dice desde cuándo van los ingresos, y lo pendiente los cuenta desde ahí', async () => {
    ingresosDesde = '2026-10-06';
    const json = await (await GET(new NextRequest('http://localhost/api/integrations/computo'))).json();
    expect(json).toMatchObject({ desde: '2026-10-01', ingresosDesde: '2026-10-06' });
    expect(calcularPlan).toHaveBeenCalledWith('dueno', '2026-10-01', '2026-10-06');
  });

  it('sin fecha de ingresos todavía, null: no se manda ninguno', async () => {
    const json = await (await GET(new NextRequest('http://localhost/api/integrations/computo'))).json();
    expect(json.ingresosDesde).toBeNull();
    expect(calcularPlan).toHaveBeenCalledWith('dueno', '2026-10-01', null);
  });

  it('mover la fecha de los ingresos la guarda y manda lo pendiente', async () => {
    expect((await put({ ingresosDesde: '2026-10-05' })).status).toBe(200);
    expect(guardarEnlace).toHaveBeenCalledWith('dueno', { ingresosDesde: '2026-10-05' });
    expect(programarSyncComputo).toHaveBeenCalledWith('dueno');
  });

  it('una fecha de ingresos futura o ilegible no vale, y no se guarda nada', async () => {
    // Hoy es el 11 de octubre (ver `hoyClave` arriba).
    expect((await put({ ingresosDesde: '2026-10-12' })).status).toBe(422);
    expect((await put({ ingresosDesde: '26/10/2026' })).status).toBe(422);
    expect((await put({ desde: '2026-10-01', ingresosDesde: '2027-01-01' })).status).toBe(422);
    expect(guardarEnlace).not.toHaveBeenCalled();
  });
});
