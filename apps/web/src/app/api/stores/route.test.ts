// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Las rutas de tiendas son finas: validan, llaman a la capa de datos y
 * responden con el código correcto. Aquí se prueba ese contrato con la capa de
 * datos y el buscador falsos.
 */

let logueado = true;
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => (logueado ? { userId: 'u1' } : null),
  unauthorized: () => Response.json({ message: 'Unauthorized' }, { status: 401 }),
  notFound: (m = 'Not found') => Response.json({ message: m }, { status: 404 }),
}));

const datos = {
  listarTiendas: vi.fn(async () => ({ tiendas: [], sucursales: [], repetidas: [] })),
  crearSucursal: vi.fn(async (_u: string, s: { nombre: string }) => ({ id: 'n1', nombre: s.nombre, direccion: null, lat: 1, lng: 1 })),
  leerSucursal: vi.fn(async () => null),
  actualizarSucursal: vi.fn(async () => null),
  borrarSucursal: vi.fn(async () => true),
  unirTiendas: vi.fn(async () => ({ compras: 2, sueltas: 0, sucursales: 1 })),
};
vi.mock('@/lib/stores-data', async () => {
  const real = await vi.importActual<typeof import('@/lib/stores-data')>('@/lib/stores-data');
  return { ...datos, esUuid: real.esUuid };
});
vi.mock('@/lib/db', () => ({ sql: () => Promise.resolve([]) }));

const sync = vi.fn();
vi.mock('@/lib/computo/programar', () => ({ programarSyncComputo: (u: string) => sync(u) }));
vi.mock('@/lib/revalidate-purchases', () => ({ revalidateAfterPurchase: () => undefined }));

const buscador = { consultar: vi.fn<(url: URL) => Promise<unknown>>() };
vi.mock('@/lib/osm', async () => {
  const real = await vi.importActual<typeof import('@/lib/osm')>('@/lib/osm');
  return { ...real, consultarNominatim: (url: URL) => buscador.consultar(url) };
});

const raiz = await import('./route');
const porId = await import('./[id]/route');
const union = await import('./merge/route');
const busqueda = await import('./search/route');
const inversa = await import('./reverse/route');
const { BuscadorNoDisponible } = await import('@/lib/osm');

const SUC = '11111111-1111-4111-8111-111111111111';
const pedir = (ruta: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://localhost${ruta}`, {
    method: init?.method ?? 'GET',
    body: init?.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  logueado = true;
  for (const f of Object.values(datos)) f.mockClear();
  sync.mockClear();
  buscador.consultar.mockReset();
});

describe('/api/stores', () => {
  it('sin sesión, 401 en todas', async () => {
    logueado = false;
    expect((await raiz.GET(pedir('/api/stores'))).status).toBe(401);
    expect((await raiz.POST(pedir('/api/stores', { method: 'POST', body: { name: 'x' } }))).status).toBe(401);
    expect((await union.POST(pedir('/api/stores/merge', { method: 'POST', body: {} }))).status).toBe(401);
    expect((await busqueda.GET(pedir('/api/stores/search?q=publix'))).status).toBe(401);
    expect((await porId.DELETE(pedir(`/api/stores/${SUC}`, { method: 'DELETE' }), ctx(SUC))).status).toBe(401);
    expect(datos.listarTiendas).not.toHaveBeenCalled();
  });

  it('GET lista las del usuario', async () => {
    const res = await raiz.GET(pedir('/api/stores'));
    expect(res.status).toBe(200);
    expect(datos.listarTiendas).toHaveBeenCalledWith('u1');
  });

  it('POST valida (422), rechaza JSON roto (400) y crea (201)', async () => {
    expect((await raiz.POST(pedir('/api/stores', { method: 'POST', body: '{roto' }))).status).toBe(400);
    const sinNombre = await raiz.POST(pedir('/api/stores', { method: 'POST', body: { name: ' ' } }));
    expect(sinNombre.status).toBe(422);
    expect(await sinNombre.json()).toEqual({ message: 'Ponle nombre a la tienda' });
    const res = await raiz.POST(pedir('/api/stores', { method: 'POST', body: { name: 'Publix', latitude: 26, longitude: -80.3 } }));
    expect(res.status).toBe(201);
    expect(datos.crearSucursal).toHaveBeenCalledWith('u1', { nombre: 'Publix', direccion: null, lat: 26, lng: -80.3 });
  });
});

describe('/api/stores/[id]', () => {
  it('un id que no es UUID es 404 sin tocar la base', async () => {
    expect((await porId.GET(pedir('/api/stores/abc'), ctx('abc'))).status).toBe(404);
    expect((await porId.DELETE(pedir('/api/stores/abc', { method: 'DELETE' }), ctx('abc'))).status).toBe(404);
    expect(datos.leerSucursal).not.toHaveBeenCalled();
    expect(datos.borrarSucursal).not.toHaveBeenCalled();
  });

  it('PATCH valida; una sucursal ajena es 404', async () => {
    const mala = await porId.PATCH(pedir(`/api/stores/${SUC}`, { method: 'PATCH', body: { latitude: 26 } }), ctx(SUC));
    expect(mala.status).toBe(422);
    const ajena = await porId.PATCH(pedir(`/api/stores/${SUC}`, { method: 'PATCH', body: { address: 'x' } }), ctx(SUC));
    expect(ajena.status).toBe(404);
    expect(datos.actualizarSucursal).toHaveBeenCalledWith('u1', SUC, { direccion: 'x' });
  });

  it('DELETE borra y responde 204', async () => {
    const res = await porId.DELETE(pedir(`/api/stores/${SUC}`, { method: 'DELETE' }), ctx(SUC));
    expect(res.status).toBe(204);
    expect(datos.borrarSucursal).toHaveBeenCalledWith('u1', SUC);
  });
});

describe('/api/stores/merge', () => {
  it('une y lleva el cambio a Computo', async () => {
    const res = await union.POST(pedir('/api/stores/merge', { method: 'POST', body: { name: 'CVS', variants: ['Cvs', 'CVS Pharmacy'] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nombre: 'CVS', compras: 2, sueltas: 0, sucursales: 1 });
    expect(datos.unirTiendas).toHaveBeenCalledWith('u1', ['Cvs', 'CVS Pharmacy'], 'CVS');
    expect(sync).toHaveBeenCalledWith('u1');
  });

  it('sin tickets cambiados no hay nada que llevar a Computo', async () => {
    datos.unirTiendas.mockResolvedValueOnce({ compras: 0, sueltas: 0, sucursales: 1 });
    await union.POST(pedir('/api/stores/merge', { method: 'POST', body: { name: 'Aldi', variants: ['aldi'] } }));
    expect(sync).not.toHaveBeenCalled();
  });

  it('valida antes de escribir', async () => {
    const res = await union.POST(pedir('/api/stores/merge', { method: 'POST', body: { name: 'CVS', variants: [] } }));
    expect(res.status).toBe(422);
    expect(datos.unirTiendas).not.toHaveBeenCalled();
  });
});

describe('/api/stores/search y /reverse', () => {
  it('busca acotado a tu zona y devuelve lo más cercano primero', async () => {
    buscador.consultar.mockResolvedValueOnce([
      { name: 'Publix', lat: '25.89', lon: '-80.16', address: { road: 'Biscayne Blvd' } },
      { name: 'Publix', lat: '26.008', lon: '-80.296', address: { road: 'Pines Blvd' } },
    ]);
    const res = await busqueda.GET(pedir('/api/stores/search?q=publix&lat=26.0078&lng=-80.2962'));
    expect(res.status).toBe(200);
    const { resultados } = (await res.json()) as { resultados: { direccion: string }[] };
    expect(resultados.map((r) => r.direccion)).toEqual(['Pines Blvd', 'Biscayne Blvd']);
    const url = buscador.consultar.mock.calls[0][0];
    expect(url.searchParams.get('bounded')).toBe('1');
  });

  it('búsqueda corta o punto roto: 422, sin salir a OSM', async () => {
    expect((await busqueda.GET(pedir('/api/stores/search?q=p'))).status).toBe(422);
    expect((await busqueda.GET(pedir('/api/stores/search?q=publix&lat=x&lng=1'))).status).toBe(422);
    expect((await inversa.GET(pedir('/api/stores/reverse'))).status).toBe(422);
    expect(buscador.consultar).not.toHaveBeenCalled();
  });

  it('si OSM no responde: 502 con un mensaje que se puede enseñar', async () => {
    buscador.consultar.mockRejectedValueOnce(new BuscadorNoDisponible('429'));
    const res = await busqueda.GET(pedir('/api/stores/search?q=publix'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ message: 'El buscador no responde ahora' });
  });

  it('inversa: la calle del punto', async () => {
    buscador.consultar.mockResolvedValueOnce({ name: 'Publix', address: { house_number: '12800', road: 'Biscayne Boulevard', town: 'North Miami' } });
    const res = await inversa.GET(pedir('/api/stores/reverse?lat=25.8942&lng=-80.1636'));
    expect(await res.json()).toEqual({ nombre: 'Publix', direccion: '12800 Biscayne Boulevard, North Miami' });
  });
});
