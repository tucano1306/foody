import { coordenadasValidas } from './geo';
import { LARGO_MAXIMO_NOMBRE, limpiarNombreTienda } from './tiendas';

/**
 * Validación de lo que llega a las rutas de tiendas. Una sola por tipo de
 * entrada, compartida entre crear y editar, con el mensaje en español que ve
 * el dueño. Las rutas responden 422 con `error` tal cual.
 */

export type Lectura<T> = { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly error: string };

export interface SucursalNueva {
  readonly nombre: string;
  readonly direccion: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface CambioDeSucursal {
  readonly direccion?: string | null;
  readonly lat?: number;
  readonly lng?: number;
}

export const LARGO_MAXIMO_DIRECCION = 500;

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function leerDireccion(v: unknown): Lectura<string | null> {
  if (v === undefined || v === null) return { ok: true, valor: null };
  if (typeof v !== 'string') return { ok: false, error: 'La dirección no es válida' };
  const limpia = v.replace(/\s+/g, ' ').trim();
  if (limpia.length > LARGO_MAXIMO_DIRECCION) return { ok: false, error: 'La dirección es demasiado larga' };
  return { ok: true, valor: limpia || null };
}

/**
 * Las dos coordenadas van juntas o ninguna: una latitud sin longitud no es
 * un sitio, y guardarla dejaría una sucursal que el mapa no sabe pintar.
 */
function leerCoordenadas(lat: unknown, lng: unknown): Lectura<{ lat: number; lng: number } | null> {
  const sinLat = lat === undefined || lat === null;
  const sinLng = lng === undefined || lng === null;
  if (sinLat && sinLng) return { ok: true, valor: null };
  if (sinLat || sinLng || !coordenadasValidas(lat, lng)) return { ok: false, error: 'La ubicación no es válida' };
  return { ok: true, valor: { lat: lat as number, lng: lng as number } };
}

/** POST /api/stores: una sucursal nueva (o una tienda sin ubicación). */
export function leerSucursalNueva(body: unknown): Lectura<SucursalNueva> {
  if (!esObjeto(body)) return { ok: false, error: 'Faltan los datos de la tienda' };
  const nombre = limpiarNombreTienda(body.name);
  if (!nombre) return { ok: false, error: 'Ponle nombre a la tienda' };
  if (nombre.length > LARGO_MAXIMO_NOMBRE) return { ok: false, error: 'El nombre es demasiado largo' };
  const direccion = leerDireccion(body.address);
  if (!direccion.ok) return direccion;
  const punto = leerCoordenadas(body.latitude, body.longitude);
  if (!punto.ok) return punto;
  return {
    ok: true,
    valor: { nombre, direccion: direccion.valor, lat: punto.valor?.lat ?? null, lng: punto.valor?.lng ?? null },
  };
}

/**
 * PATCH /api/stores/[id]: dirección y ubicación. El nombre NO se cambia aquí:
 * renombrar una sola sucursal la separaría de sus compras, que siguen con el
 * nombre viejo. Para eso está unir tiendas, que cambia todo a la vez.
 */
export function leerCambioDeSucursal(body: unknown): Lectura<CambioDeSucursal> {
  if (!esObjeto(body)) return { ok: false, error: 'Faltan los datos de la tienda' };
  const cambio: { direccion?: string | null; lat?: number; lng?: number } = {};
  if ('address' in body) {
    const d = leerDireccion(body.address);
    if (!d.ok) return d;
    cambio.direccion = d.valor;
  }
  if ('latitude' in body || 'longitude' in body) {
    const p = leerCoordenadas(body.latitude, body.longitude);
    if (!p.ok) return p;
    // Borrar la ubicación de una sucursal es borrar la sucursal: si no, queda
    // una fila que no está en el mapa ni sirve para detectar la llegada.
    if (!p.valor) return { ok: false, error: 'La ubicación no es válida' };
    cambio.lat = p.valor.lat;
    cambio.lng = p.valor.lng;
  }
  if (Object.keys(cambio).length === 0) return { ok: false, error: 'No hay nada que cambiar' };
  return { ok: true, valor: cambio };
}

export interface Union {
  readonly variantes: readonly string[];
  readonly nombre: string;
}

export const MAXIMO_VARIANTES = 30;

/**
 * POST /api/stores/merge: las formas de escribir una tienda y el nombre con
 * que se quedan todas. Renombrar es lo mismo con una sola variante.
 */
export function leerUnion(body: unknown): Lectura<Union> {
  if (!esObjeto(body)) return { ok: false, error: 'Faltan las tiendas que unir' };
  const nombre = limpiarNombreTienda(body.name);
  if (!nombre) return { ok: false, error: 'Ponle nombre a la tienda' };
  if (nombre.length > LARGO_MAXIMO_NOMBRE) return { ok: false, error: 'El nombre es demasiado largo' };
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return { ok: false, error: 'Faltan las tiendas que unir' };
  }
  if (body.variants.length > MAXIMO_VARIANTES) return { ok: false, error: 'Son demasiadas tiendas a la vez' };
  const variantes: string[] = [];
  for (const v of body.variants) {
    const limpia = limpiarNombreTienda(v);
    if (!limpia || limpia.length > LARGO_MAXIMO_NOMBRE) return { ok: false, error: 'Una de las tiendas no es válida' };
    if (!variantes.includes(limpia)) variantes.push(limpia);
  }
  return { ok: true, valor: { variantes, nombre } };
}

/** `?q=` de la búsqueda: lo bastante corto para no abusar del buscador. */
export function leerBusqueda(q: string | null): Lectura<string> {
  const limpia = (q ?? '').replace(/\s+/g, ' ').trim();
  if (limpia.length < 2) return { ok: false, error: 'Escribe al menos dos letras' };
  if (limpia.length > 100) return { ok: false, error: 'La búsqueda es demasiado larga' };
  return { ok: true, valor: limpia };
}

/** `?lat=&lng=` opcionales; si vienen, tienen que ser un sitio de verdad. */
export function leerPuntoDeConsulta(lat: string | null, lng: string | null): Lectura<{ lat: number; lng: number } | null> {
  if ((lat === null || lat === '') && (lng === null || lng === '')) return { ok: true, valor: null };
  const p = leerCoordenadas(lat === null || lat === '' ? null : Number(lat), lng === null || lng === '' ? null : Number(lng));
  return p;
}
