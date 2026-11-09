import { distanciaMetros, type Punto } from './geo';
import type { LugarEncontrado } from './osm';
import type { Sucursal } from './tiendas';
import type { TiendasDelUsuario } from './stores-data';

/**
 * Las llamadas del navegador a /api/stores. Todas por el proxy, sin caché
 * (el service worker no guarda /stores, pero `no-store` lo deja dicho), y
 * todas lanzan un Error con el mensaje en español que devuelve la ruta: la
 * pantalla lo enseña tal cual en un aviso.
 */

const BASE = '/api/proxy/stores';

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    throw new Error('Sin conexión');
  }
  if (res.status === 204) return undefined as T;
  const datos = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(datos?.message || 'Algo falló; inténtalo otra vez');
  return datos as T;
}

export const cargarTiendas = () => pedir<TiendasDelUsuario>('');

export const guardarSucursal = (s: { nombre: string; direccion: string | null; lat: number; lng: number }) =>
  pedir<Sucursal>('', {
    method: 'POST',
    body: JSON.stringify({ name: s.nombre, address: s.direccion, latitude: s.lat, longitude: s.lng }),
  });

export const quitarSucursal = (id: string) => pedir<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const unirTiendas = (variantes: readonly string[], nombre: string) =>
  pedir<{ nombre: string; compras: number; sueltas: number; sucursales: number }>('/merge', {
    method: 'POST',
    body: JSON.stringify({ variants: variantes, name: nombre }),
  });

/**
 * Busca por nombre cerca de `centro`. El centro sale del teléfono redondeado
 * a dos decimales (~1 km): para «el Publix de por aquí» basta el barrio, y así
 * tu posición exacta no llega ni a nuestro servidor.
 *
 * Por eso la `distancia` que devuelve el servidor es desde ese centro
 * redondeado: la hoja la rehace con tu posición (`conDistanciaDesde`) o no
 * la enseña.
 */
export async function buscarLugares(q: string, centro: Punto | null): Promise<LugarEncontrado[]> {
  const params = new URLSearchParams({ q });
  if (centro) {
    params.set('lat', centro.lat.toFixed(2));
    params.set('lng', centro.lng.toFixed(2));
  }
  return (await pedir<{ resultados: LugarEncontrado[] }>(`/search?${params}`)).resultados;
}

/** Las distancias desde donde estás de verdad, la más cercana primero; sin posición, ninguna. */
export function conDistanciaDesde(yo: Punto | null, lugares: readonly LugarEncontrado[]): LugarEncontrado[] {
  if (!yo) return lugares.map((l) => ({ ...l, distancia: null }));
  return lugares
    .map((l) => ({ ...l, distancia: distanciaMetros(yo, l) }))
    .sort((a, b) => (a.distancia ?? 0) - (b.distancia ?? 0));
}

/** La calle de un punto; null si el buscador no responde (no es motivo para no guardar). */
export async function calleDe(p: Punto): Promise<string | null> {
  try {
    const params = new URLSearchParams({ lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) });
    return (await pedir<{ direccion: string | null }>(`/reverse?${params}`)).direccion;
  } catch {
    return null;
  }
}
