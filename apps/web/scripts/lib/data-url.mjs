/**
 * data-url.mjs — decodificación de data URLs base64.
 *
 * Vive fuera del script de migración para poder probarse: es la pieza donde un
 * error no se nota (una imagen corrupta se ve como un cuadro roto meses
 * después, cuando ya no queda el base64 original para recuperarla).
 *
 * Se prueba en data-url.test.ts.
 */

/**
 * @typedef {object} DecodedDataUrl
 * @property {Buffer} buffer      Bytes de la imagen.
 * @property {string} contentType MIME declarado en la cabecera.
 * @property {'jpg'|'png'|'webp'} extension Extensión para el nombre del archivo.
 */

/** Tipos que el formulario puede producir; cualquier otro cae a jpg. */
const EXTENSION_BY_TYPE = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

/**
 * Decodifica "data:image/jpeg;base64,/9j/4AA…" a bytes.
 *
 * Devuelve null —en vez de lanzar— ante cualquier entrada que no sea un data
 * URL base64 con contenido: quien llama debe poder saltarse esa fila y dejarla
 * intacta, no abortar la migración entera.
 *
 * @param {unknown} dataUrl
 * @returns {DecodedDataUrl | null}
 */
export function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:')) return null;

  const comma = dataUrl.indexOf(',');
  if (comma === -1) return null;

  const header = dataUrl.slice(0, comma);
  // Sin ";base64" el payload va URL-encoded, que este script no produce ni espera.
  if (!header.includes(';base64')) return null;

  const contentType = /^data:([^;,]+)/.exec(header)?.[1] ?? 'image/jpeg';

  const payload = dataUrl.slice(comma + 1);
  if (payload.length === 0) return null;

  // Buffer.from ignora en silencio los caracteres no válidos en base64, así que
  // un payload corrupto puede devolver menos bytes en lugar de fallar. Se valida
  // que el resultado tenga tamaño y empiece por una firma de imagen conocida.
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) return null;

  return {
    buffer,
    contentType,
    extension: EXTENSION_BY_TYPE[contentType] ?? 'jpg',
  };
}

/**
 * Comprueba que los bytes empiecen por la firma del formato que dicen ser.
 * Una imagen que no la cumple está corrupta y no debe reemplazar al original.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function looksLikeImage(buffer) {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  // WebP: "RIFF" .... "WEBP"
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return true;
  }

  return false;
}

/** @param {number} bytes */
export function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}
