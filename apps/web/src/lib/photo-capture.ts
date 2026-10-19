/**
 * photo-capture.ts — la cámara de las fotos de producto, sin salir del navegador.
 *
 * El botón de cámara era un `<input type="file" capture="environment">`. En
 * Android eso abre la app de cámara del sistema, que es pesada; para hacerle
 * sitio, Android cierra Chrome por detrás. Al volver con la foto, la página que
 * la pidió ya no existe: Chrome la descarta y enseña su propio aviso, «No se ha
 * podido completar la operación anterior por falta de memoria»
 * (IDS_LOW_MEMORY_ERROR en Chromium, que lo muestra cuando el resultado de la
 * cámara llega y nadie lo espera). Ningún ajuste de la compresión lo evitaba:
 * la foto nunca llegaba a la página. Así se quedaron sin foto los productos del
 * 19 oct 2026, y por eso ya se había quejado antes (jul 2026).
 *
 * Con getUserMedia la cámara corre dentro de la pestaña: Chrome nunca pasa a
 * segundo plano, así que no hay nada que matar. De paso el fotograma sale ya a
 * la medida final, sin decodificar una foto de 12 MP.
 */

/** Lado mayor de la foto de producto guardada, en píxeles. */
export const PRODUCT_PHOTO_MAX = 512;

/** Calidad JPEG de la foto de producto: a 512 px no se nota y pesa ~40 KB. */
export const PRODUCT_PHOTO_QUALITY = 0.72;

export interface Size {
  readonly w: number;
  readonly h: number;
}

/** Rectángulo de origen, en píxeles del vídeo, para `drawImage`. */
export interface SourceRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/** Reduce (nunca amplía) para que el lado mayor no pase de `max`. */
export function fitWithin(srcWidth: number, srcHeight: number, max: number): Size {
  if (srcWidth <= max && srcHeight <= max) return { w: srcWidth, h: srcHeight };
  if (srcWidth > srcHeight) {
    return { w: max, h: Math.max(1, Math.round((srcHeight * max) / srcWidth)) };
  }
  return { w: Math.max(1, Math.round((srcWidth * max) / srcHeight)), h: max };
}

/**
 * El trozo del fotograma que de verdad se ve en una caja con `object-cover`.
 *
 * El vídeo llena la pantalla y recorta lo que le sobra por los lados (o por
 * arriba y abajo). Guardar el fotograma entero metería en la foto cosas que el
 * usuario no tenía en el visor; esto guarda exactamente lo que encuadró.
 * null si aún no hay medidas (el vídeo no ha arrancado o la caja no se pinta).
 */
export function coverSourceRect(
  videoWidth: number,
  videoHeight: number,
  boxWidth: number,
  boxHeight: number,
): SourceRect | null {
  if (!(videoWidth > 0 && videoHeight > 0 && boxWidth > 0 && boxHeight > 0)) return null;
  // Factor con el que object-cover estira el vídeo hasta tapar la caja entera.
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const sw = Math.min(videoWidth, boxWidth / scale);
  const sh = Math.min(videoHeight, boxHeight / scale);
  return { sx: (videoWidth - sw) / 2, sy: (videoHeight - sh) / 2, sw, sh };
}

/**
 * ¿Se puede abrir la cámara dentro de la página? Sin contexto seguro (http
 * que no sea localhost) o en navegadores viejos no existe `mediaDevices`, y
 * entonces solo queda la cámara del sistema.
 */
export function hasLiveCamera(nav: Navigator | undefined = globalThis.navigator): boolean {
  return typeof nav?.mediaDevices?.getUserMedia === 'function';
}

/**
 * El motivo por el que getUserMedia no dio la cámara, en una línea. Los
 * navegadores rechazan con un DOMException cuyo `name` es lo único estable;
 * el `message` cambia de uno a otro y viene en inglés.
 */
export function cameraErrorMessage(err: unknown): string {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Sin permiso para usar la cámara.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró ninguna cámara.';
    case 'NotReadableError':
    case 'AbortError':
      // Otra app (o otra pestaña) la tiene abierta: Android no la comparte.
      return 'La cámara está ocupada por otra app.';
    default:
      return 'No se pudo abrir la cámara.';
  }
}
