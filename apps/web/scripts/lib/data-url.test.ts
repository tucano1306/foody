import { describe, it, expect } from 'vitest';
import { decodeDataUrl, looksLikeImage, formatKB } from './data-url.mjs';

/**
 * Afirma que la decodificación tuvo éxito y devuelve el resultado ya sin null.
 * `decodeDataUrl` devuelve null a propósito, y los tipos JSDoc del módulo lo
 * propagan; esto evita repetir la comprobación en cada aserción.
 */
function decodeOk(dataUrl: string) {
  const decoded = decodeDataUrl(dataUrl);
  if (decoded === null) throw new Error(`Se esperaba decodificar: ${dataUrl.slice(0, 40)}…`);
  return decoded;
}

/** JPEG mínimo válido: SOI + APP0 "JFIF" + EOI. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);
/** Firma PNG de 8 bytes + relleno. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
/** Cabecera WebP: "RIFF" + tamaño + "WEBP". */
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

const toDataUrl = (buf: Buffer, type = 'image/jpeg') => `data:${type};base64,${buf.toString('base64')}`;

describe('decodeDataUrl — fidelidad de los bytes', () => {
  it('devuelve exactamente los mismos bytes que se codificaron', () => {
    expect(Buffer.compare(decodeOk(toDataUrl(JPEG)).buffer, JPEG)).toBe(0);
  });

  it('conserva la fidelidad con datos binarios de todos los valores posibles', () => {
    // 0x00–0xFF cubre bytes nulos y alto rango, donde una conversión por
    // string (latin1/utf8) corrompería silenciosamente el contenido.
    const todosLosBytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    expect(Buffer.compare(decodeOk(toDataUrl(todosLosBytes)).buffer, todosLosBytes)).toBe(0);
  });

  it('soporta imágenes grandes sin truncar', () => {
    const grande = Buffer.alloc(200_000, 0xab);
    const decoded = decodeOk(toDataUrl(grande));
    expect(decoded.buffer.length).toBe(200_000);
    expect(Buffer.compare(decoded.buffer, grande)).toBe(0);
  });
});

describe('decodeDataUrl — tipo y extensión', () => {
  it('mapea cada MIME a su extensión', () => {
    expect(decodeOk(toDataUrl(JPEG, 'image/jpeg')).extension).toBe('jpg');
    expect(decodeOk(toDataUrl(PNG, 'image/png')).extension).toBe('png');
    expect(decodeOk(toDataUrl(WEBP, 'image/webp')).extension).toBe('webp');
  });

  it('cae a jpg ante un MIME desconocido, conservando el declarado', () => {
    const decoded = decodeOk(toDataUrl(JPEG, 'image/heic'));
    expect(decoded.extension).toBe('jpg');
    expect(decoded.contentType).toBe('image/heic');
  });

  it('tolera parámetros extra en la cabecera', () => {
    const decoded = decodeOk(`data:image/png;charset=utf-8;base64,${PNG.toString('base64')}`);
    expect(decoded.contentType).toBe('image/png');
    expect(decoded.extension).toBe('png');
  });
});

describe('decodeDataUrl — entradas que debe rechazar', () => {
  it.each([
    ['no es data URL', 'https://ejemplo.com/foto.jpg'],
    ['ya migrada', 'https://xyz.public.blob.vercel-storage.com/products/a/photo.jpg'],
    ['sin coma', 'data:image/jpeg;base64'],
    ['payload vacío', 'data:image/jpeg;base64,'],
    ['sin marca base64', 'data:image/jpeg,texto-plano'],
    ['cadena vacía', ''],
    ['basura', 'no-es-nada'],
  ])('devuelve null: %s', (_caso, entrada) => {
    expect(decodeDataUrl(entrada)).toBeNull();
  });

  it.each([[null], [undefined], [123], [{}], [[]]])(
    'devuelve null ante un valor no textual (%s)',
    (entrada) => {
      expect(decodeDataUrl(entrada as unknown as string)).toBeNull();
    },
  );

  it('no lanza nunca: quien llama debe poder saltarse la fila', () => {
    expect(() => decodeDataUrl('data:image/jpeg;base64,!!!no-es-base64!!!')).not.toThrow();
  });
});

describe('looksLikeImage — detección de contenido corrupto', () => {
  it('reconoce las firmas de los formatos que produce la app', () => {
    expect(looksLikeImage(JPEG)).toBe(true);
    expect(looksLikeImage(PNG)).toBe(true);
    expect(looksLikeImage(WEBP)).toBe(true);
  });

  it('rechaza bytes que no son imagen', () => {
    expect(looksLikeImage(Buffer.from('esto es texto plano'))).toBe(false);
    expect(looksLikeImage(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toBe(false);
  });

  it('rechaza buffers vacíos o demasiado cortos', () => {
    expect(looksLikeImage(Buffer.alloc(0))).toBe(false);
    expect(looksLikeImage(Buffer.from([0xff, 0xd8]))).toBe(false);
    expect(looksLikeImage(null as unknown as Buffer)).toBe(false);
  });

  it('no confunde un RIFF que no sea WebP (p. ej. un WAV)', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x1a, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(looksLikeImage(wav)).toBe(false);
  });
});

describe('decodeDataUrl + looksLikeImage — el flujo real de la migración', () => {
  it('acepta una foto sana', () => {
    expect(looksLikeImage(decodeOk(toDataUrl(JPEG)).buffer)).toBe(true);
  });

  it('atrapa un base64 que decodifica a algo que no es imagen', () => {
    // Decodifica sin error…
    const decoded = decodeOk(toDataUrl(Buffer.from('contenido corrupto')));
    // …pero no es una imagen, así que la migración debe saltarse esa fila.
    expect(looksLikeImage(decoded.buffer)).toBe(false);
  });
});

describe('formatKB', () => {
  it('redondea a KB enteros', () => {
    expect(formatKB(2048)).toBe('2 KB');
    expect(formatKB(35_000)).toBe('34 KB');
    expect(formatKB(0)).toBe('0 KB');
  });
});
