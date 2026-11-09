import { distanciaMetros, coordenadasValidas, type Punto } from './geo';

/**
 * Búsqueda de tiendas en OpenStreetMap (Nominatim): gratis y sin clave, a
 * cambio de cumplir su política de uso:
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * - Como mucho una petición por segundo. Aquí se espera entre llamadas.
 * - Un User-Agent que identifique la app, no el de la librería HTTP.
 * - Nada de «buscar mientras escribes». La búsqueda se lanza al pulsar
 *   «Buscar»; mientras escribes solo se filtran tus propias tiendas.
 * - Guardar lo ya pedido en caché en vez de repetirlo.
 *
 * Va por el servidor y no desde el navegador por las dos primeras reglas, y
 * para no abrir la CSP a otro dominio. El User-Agent NO lleva el email del
 * dueño: identifica a Foody, no a él.
 */

const BASE = 'https://nominatim.openstreetmap.org';
export const AGENTE = 'foody-web/1.0 (+https://foody-web-eight.vercel.app)';

export interface LugarEncontrado {
  readonly nombre: string;
  readonly direccion: string | null;
  readonly lat: number;
  readonly lng: number;
  /** Metros desde donde estás, si se sabe. */
  readonly distancia: number | null;
}

/**
 * El centro se redondea a dos decimales (~1 km) antes de salir hacia OSM:
 * para encontrar «el Publix de por aquí» basta el barrio, y así lo que se
 * envía no es tu posición exacta.
 */
export function redondearCentro(p: Punto): Punto {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

/** Medio lado de la caja de búsqueda: ~22 km, lo que se conduce para ir al súper. */
const MEDIO_LADO_GRADOS = 0.2;

export function urlDeBusqueda(q: string, centro: Punto | null): URL {
  const url = new URL('/search', BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '10');
  if (centro) {
    const c = redondearCentro(centro);
    const d = MEDIO_LADO_GRADOS;
    // viewbox = oeste, norte, este, sur. `bounded=1`: solo dentro de la caja;
    // sin eso «Publix» devuelve el primero de Florida, no el de tu zona.
    url.searchParams.set('viewbox', [c.lng - d, c.lat + d, c.lng + d, c.lat - d].map((n) => n.toFixed(2)).join(','));
    url.searchParams.set('bounded', '1');
  }
  return url;
}

export function urlInversa(p: Punto): URL {
  const url = new URL('/reverse', BASE);
  url.searchParams.set('lat', p.lat.toFixed(6));
  url.searchParams.set('lon', p.lng.toFixed(6));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  return url;
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * «12800 Biscayne Boulevard, North Miami»: lo que distingue un Publix de otro
 * sin la parrafada de `display_name` (condado, estado, país…).
 */
export function direccionCorta(address: unknown): string | null {
  if (typeof address !== 'object' || address === null) return null;
  const a = address as Record<string, unknown>;
  const calle = [texto(a.house_number), texto(a.road)].filter(Boolean).join(' ');
  const lugar = texto(a.city) ?? texto(a.town) ?? texto(a.village) ?? texto(a.hamlet) ?? texto(a.suburb);
  const partes = [calle || null, lugar].filter((p): p is string => !!p);
  return partes.length > 0 ? partes.join(', ') : null;
}

function numero(v: unknown): number {
  return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
}

export function leerResultados(json: unknown, centro: Punto | null, maximo = 6): LugarEncontrado[] {
  if (!Array.isArray(json)) return [];
  const lugares: LugarEncontrado[] = [];
  for (const r of json) {
    if (typeof r !== 'object' || r === null) continue;
    const fila = r as Record<string, unknown>;
    const lat = numero(fila.lat);
    const lng = numero(fila.lon);
    if (!coordenadasValidas(lat, lng)) continue;
    const display = texto(fila.display_name);
    const nombre = texto(fila.name) ?? display?.split(',')[0]?.trim() ?? null;
    if (!nombre) continue;
    const direccion = direccionCorta(fila.address) ?? (display ? display.split(',').slice(1, 3).join(',').trim() || null : null);
    lugares.push({ nombre, direccion, lat, lng, distancia: centro ? distanciaMetros(centro, { lat, lng }) : null });
  }
  // Nominatim ordena por «importancia», no por cercanía: el Publix famoso de
  // Miami Beach antes que el de tu calle.
  if (centro) lugares.sort((a, b) => (a.distancia ?? 0) - (b.distancia ?? 0));
  return lugares.slice(0, maximo);
}

export function leerInversa(json: unknown): { nombre: string | null; direccion: string | null } {
  if (typeof json !== 'object' || json === null) return { nombre: null, direccion: null };
  const r = json as Record<string, unknown>;
  return { nombre: texto(r.name), direccion: direccionCorta(r.address) };
}

// ─── Llamada con freno y caché ────────────────────────────────────────────────
// Vive en la memoria de cada lambda: en Vercel hay varias y se reinician, así
// que el freno real es más flojo que «una por segundo». Para una app de una
// persona que busca de vez en cuando, sobra.

const ESPERA_MINIMA_MS = 1100;
const VIDA_CACHE_MS = 24 * 60 * 60 * 1000;
const MAXIMO_EN_CACHE = 200;

let siguienteTurno = 0;
const cache = new Map<string, { hasta: number; datos: unknown }>();

export class BuscadorNoDisponible extends Error {}

export interface Dependencias {
  readonly fetch: typeof fetch;
  readonly ahora: () => number;
  readonly esperar: (ms: number) => Promise<void>;
}

const porDefecto: Dependencias = {
  fetch: (...a) => fetch(...a),
  ahora: () => Date.now(),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export async function consultarNominatim(url: URL, deps: Dependencias = porDefecto): Promise<unknown> {
  const clave = url.toString();
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > deps.ahora()) return guardado.datos;

  // Turnos en fila: dos búsquedas a la vez salen separadas por más de un segundo.
  const ahora = deps.ahora();
  const turno = Math.max(ahora, siguienteTurno);
  siguienteTurno = turno + ESPERA_MINIMA_MS;
  if (turno > ahora) await deps.esperar(turno - ahora);

  let res: Response;
  try {
    res = await deps.fetch(clave, {
      headers: { 'User-Agent': AGENTE, Accept: 'application/json', 'Accept-Language': 'es,en' },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new BuscadorNoDisponible('Sin respuesta del buscador');
  }
  if (!res.ok) throw new BuscadorNoDisponible(`El buscador respondió ${res.status}`);
  const datos: unknown = await res.json().catch(() => {
    throw new BuscadorNoDisponible('Respuesta ilegible');
  });

  if (cache.size >= MAXIMO_EN_CACHE) {
    const masVieja = cache.keys().next().value;
    if (masVieja !== undefined) cache.delete(masVieja);
  }
  cache.set(clave, { hasta: deps.ahora() + VIDA_CACHE_MS, datos });
  return datos;
}

/** Solo para las pruebas: empezar sin caché ni turnos pendientes. */
export function reiniciarBuscador(): void {
  cache.clear();
  siguienteTurno = 0;
}
