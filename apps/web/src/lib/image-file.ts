/**
 * image-file.ts — shared helpers for user-picked photos (product photos,
 * receipt scans). Centralises the HEIC handling: Android Chrome and desktop
 * browsers can't decode HEIC/HEIF (Samsung "high efficiency" mode, iPhone
 * default), so those files must be converted server-side before any canvas
 * or <img> work.
 */

/** Vercel rejects request bodies over ~4.5 MB; keep a safety margin. */
export const MAX_HEIC_UPLOAD_BYTES = 4 * 1024 * 1024;

export const HEIC_CONVERT_TIMEOUT_MS = 60_000;

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'image/heic'
    || file.type === 'image/heif'
    || name.endsWith('.heic')
    || name.endsWith('.heif');
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} tardó demasiado. Intenta con otra foto.`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Decode a data URL locally. fetch(dataUrl) is NOT an option: the CSP's
 * connect-src doesn't allow data: URLs, so it rejects with "Failed to fetch".
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/jpeg';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export const HEIC_TOO_BIG_MESSAGE =
  'Foto HEIC demasiado grande (máx. 4 MB). Cambia el formato de la cámara: en iPhone, Ajustes > Cámara > Formatos > Más Compatible; en Samsung/Android, desactiva las imágenes HEIF de alta eficiencia.';

/**
 * In-browser HEIC→JPEG via libheif WASM (heic2any). No hay límite de tamaño
 * ni dependencia de red; el módulo (~1 MB) se carga bajo demanda solo cuando
 * el usuario elige una foto HEIC.
 */
async function convertHeicLocally(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.82 });
  return Array.isArray(out) ? out[0] : out;
}

async function convertHeicViaServer(file: File): Promise<Blob> {
  if (file.size > MAX_HEIC_UPLOAD_BYTES) {
    throw new Error(HEIC_TOO_BIG_MESSAGE);
  }
  const formData = new FormData();
  formData.append('file', file, file.name);
  const res = await withTimeout(
    fetch('/api/upload/heic', { method: 'POST', body: formData, credentials: 'include' }),
    HEIC_CONVERT_TIMEOUT_MS,
    'La conversión HEIC',
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'No se pudo convertir la foto HEIC' }));
    throw new Error(data.message ?? 'No se pudo convertir la foto HEIC');
  }
  const { dataUrl } = (await res.json()) as { dataUrl: string };
  return dataUrlToBlob(dataUrl);
}

/**
 * Convert a HEIC/HEIF file to a JPEG Blob. Primero convierte localmente
 * (WASM); si el módulo o el archivo fallan, cae al servidor (heic-convert,
 * ≤4 MB por límite de Vercel). Throws with user-facing Spanish messages.
 */
export async function convertHeicToJpegBlob(file: File): Promise<Blob> {
  try {
    return await withTimeout(convertHeicLocally(file), 45_000, 'La conversión de la foto');
  } catch (err) {
    // heic2any detecta archivos que el navegador SÍ puede leer (un JPEG mal
    // nombrado .heic) y los rechaza con ERR_USER — úsalos tal cual.
    if (err instanceof Error && err.message.includes('already browser readable')) {
      return file;
    }
    return convertHeicViaServer(file);
  }
}
