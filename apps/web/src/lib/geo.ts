import { claveDeTienda, type Sucursal } from './tiendas';

/**
 * Dónde estás respecto a tus tiendas, y qué hace el Súper con eso.
 *
 * Una PWA solo sabe tu posición con la app abierta: el navegador no deja
 * vigilarla en segundo plano. Así que esto no avisa al llegar con el teléfono
 * en el bolsillo; decide en cuanto abres el Súper en el parqueo o en la
 * puerta. La posición se usa aquí, en el teléfono, y no se guarda en ningún
 * sitio: a la base solo van las coordenadas de las tiendas que tú guardes.
 */

export interface Punto {
  readonly lat: number;
  readonly lng: number;
}

export interface Posicion extends Punto {
  /** Radio de error que da el GPS, en metros. */
  readonly precision: number;
}

/**
 * A cuánto se considera que estás EN la tienda. Un Publix de plaza en Florida
 * tiene el parqueo delante y la entrada a 100–150 m de donde aparcas; con
 * menos, abrir la app al bajar del coche no la detectaría.
 */
export const RADIO_LLEGADA_M = 150;

/**
 * Con un error mayor que este el GPS aún no sabe dónde estás (recién
 * encendido, o dentro de un edificio): mejor no decidir que decidir mal.
 */
export const PRECISION_MAXIMA_M = 200;

/**
 * Dos tiendas cerca: si la más cercana le saca esto a la siguiente, es esa.
 * Por debajo (estás en medio del parqueo de la plaza) se pregunta.
 */
const VENTAJA_CLARA_M = 75;

const RADIO_TIERRA_M = 6_371_008.8;

const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en línea recta (haversine), en metros. */
export function distanciaMetros(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Coordenadas que de verdad son un sitio. (0, 0) es lo que devuelven
 * algunos GPS cuando no tienen señal: está en mitad del océano y no es tienda.
 */
export function coordenadasValidas(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return !(lat === 0 && lng === 0);
}

export interface SucursalConPunto extends Sucursal {
  readonly lat: number;
  readonly lng: number;
}

export function conPunto(s: Sucursal): s is SucursalConPunto {
  return coordenadasValidas(s.lat, s.lng);
}

export interface Cercana {
  readonly sucursal: SucursalConPunto;
  readonly distancia: number;
}

export type Deteccion =
  | { readonly tipo: 'imprecisa' }
  | { readonly tipo: 'ninguna' }
  | { readonly tipo: 'una'; readonly sucursal: SucursalConPunto; readonly distancia: number }
  | { readonly tipo: 'varias'; readonly candidatas: readonly Cercana[] };

/** Tus sucursales ordenadas de la más cercana a la más lejana. */
export function ordenarPorDistancia(pos: Punto, sucursales: readonly Sucursal[]): Cercana[] {
  return sucursales
    .filter(conPunto)
    .map((sucursal) => ({ sucursal, distancia: distanciaMetros(pos, sucursal) }))
    .sort((a, b) => a.distancia - b.distancia);
}

/** ¿En qué tienda estás? */
export function detectarTienda(pos: Posicion, sucursales: readonly Sucursal[], radio = RADIO_LLEGADA_M): Deteccion {
  if (!coordenadasValidas(pos.lat, pos.lng) || !(pos.precision <= PRECISION_MAXIMA_M)) {
    return { tipo: 'imprecisa' };
  }
  // El error del GPS se suma al radio, pero con techo: con ±200 m todo
  // quedaría «dentro» y se elegiría una tienda que está a dos calles.
  const alcance = radio + Math.min(Math.max(0, pos.precision), 50);
  const cerca = ordenarPorDistancia(pos, sucursales).filter((c) => c.distancia <= alcance);
  if (cerca.length === 0) return { tipo: 'ninguna' };
  const [primera, segunda] = cerca;
  if (cerca.length === 1) return { tipo: 'una', ...primera };

  // Dos sucursales del MISMO nombre cerca (dos Publix): el nombre de la compra
  // es el mismo pase lo que pase, así que vale la más cercana sin preguntar.
  const clave = claveDeTienda(primera.sucursal.nombre);
  if (cerca.every((c) => claveDeTienda(c.sucursal.nombre) === clave)) return { tipo: 'una', ...primera };

  if (primera.distancia <= radio && segunda.distancia - primera.distancia >= VENTAJA_CLARA_M) {
    return { tipo: 'una', ...primera };
  }
  return { tipo: 'varias', candidatas: cerca.slice(0, 3) };
}

/** La tienda de la compra en curso, y quién la puso. */
export interface SeleccionTienda {
  readonly nombre: string;
  readonly storeId: string | null;
  /**
   * `elegida`: la puso el dueño (la escogió o dijo «voy a…»). `llegada`: la
   * detectó la app. Lo elegido a mano manda: la app propone, nunca lo pisa.
   */
  readonly origen: 'elegida' | 'llegada';
}

export type Decision =
  | { readonly tipo: 'nada' }
  /** Ponerla sin preguntar (y avisar). */
  | { readonly tipo: 'poner'; readonly sucursal: SucursalConPunto; readonly origen: SeleccionTienda['origen'] }
  /** Estás en otra tienda distinta de la que elegiste: proponer el cambio. */
  | { readonly tipo: 'sugerir'; readonly sucursal: SucursalConPunto }
  /** Hay varias pegadas: que elija. */
  | { readonly tipo: 'preguntar'; readonly candidatas: readonly SucursalConPunto[] };

/**
 * Qué hacer con lo detectado, según lo que ya está puesto.
 *
 * `descartadas`: sucursales que el dueño ya rechazó en esta compra. Sin esto,
 * el aviso «Estás en CVS» volvería cada pocos segundos mientras sigue ahí.
 */
export function decidirTienda(
  actual: SeleccionTienda | null,
  deteccion: Deteccion,
  descartadas: ReadonlySet<string> = new Set(),
): Decision {
  if (deteccion.tipo === 'imprecisa' || deteccion.tipo === 'ninguna') return { tipo: 'nada' };

  const mismoNombre = (s: Sucursal) => actual !== null && claveDeTienda(s.nombre) === claveDeTienda(actual.nombre);

  if (deteccion.tipo === 'una') {
    const s = deteccion.sucursal;
    if (actual?.storeId === s.id) return { tipo: 'nada' };
    // Dijo «voy a Publix» y está en un Publix: es la misma tienda; solo se
    // apunta en cuál, conservando que la eligió él.
    if (actual && mismoNombre(s)) return { tipo: 'poner', sucursal: s, origen: actual.origen };
    if (descartadas.has(s.id)) return { tipo: 'nada' };
    if (!actual || actual.origen === 'llegada') return { tipo: 'poner', sucursal: s, origen: 'llegada' };
    return { tipo: 'sugerir', sucursal: s };
  }

  const candidatas = deteccion.candidatas.map((c) => c.sucursal);
  if (actual?.storeId && candidatas.some((s) => s.id === actual.storeId)) return { tipo: 'nada' };
  const delMismoNombre = candidatas.filter(mismoNombre);
  if (actual && delMismoNombre.length > 0) {
    return { tipo: 'poner', sucursal: delMismoNombre[0], origen: actual.origen };
  }
  const restantes = candidatas.filter((s) => !descartadas.has(s.id));
  if (restantes.length === 0) return { tipo: 'nada' };
  if (restantes.length === 1) {
    const [s] = restantes;
    return !actual || actual.origen === 'llegada'
      ? { tipo: 'poner', sucursal: s, origen: 'llegada' }
      : { tipo: 'sugerir', sucursal: s };
  }
  return { tipo: 'preguntar', candidatas: restantes };
}

/** «a 80 m», «a 2,3 km»: como se lee de un vistazo en la tienda. */
export function textoDistancia(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return '';
  if (metros < 1000) return `a ${Math.max(10, Math.round(metros / 10) * 10)} m`;
  const km = metros / 1000;
  return `a ${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

/** Ruta en Google Maps: abre la app en Android y la web en lo demás. */
export function enlaceComoLlegar(p: Punto): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/**
 * El centro de unos puntos: dónde buscar «cerca» sin pedir la posición. Con
 * tus sucursales da tu zona, que es lo que hace falta para que «Publix» no
 * devuelva uno de Georgia.
 */
export function centroDe(puntos: readonly Punto[]): Punto | null {
  if (puntos.length === 0) return null;
  const lat = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length;
  const lng = puntos.reduce((s, p) => s + p.lng, 0) / puntos.length;
  return { lat, lng };
}
