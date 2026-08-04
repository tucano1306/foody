import { describe, it, expect } from 'vitest';
import { sameOriginPhoto } from './PhotoLightbox';

/**
 * El zoom mostraba la imagen rota: cargaba la URL del almacenamiento tal cual
 * y el navegador la bloqueaba, porque el host tiene dos niveles de subdominio
 * y el comodín de `img-src` cubre uno. Estos tests fijan la regla que lo
 * evita — todo lo remoto pasa por el mismo origen — para que no se vuelva a
 * romper si alguien "simplifica" el visor.
 */
describe('sameOriginPhoto', () => {
  const BLOB = 'https://xwe2azwmzm9wr4gi.public.blob.vercel-storage.com/products/abc/photo-x1.jpg';

  it('enruta una foto del almacenamiento por el mismo origen', () => {
    const out = sameOriginPhoto(BLOB);
    expect(out.startsWith('/_next/image?url=')).toBe(true);
    expect(out).not.toContain('https://xwe2azwmzm9wr4gi');
  });

  it('conserva la URL original codificada, sin perder la ruta', () => {
    const out = sameOriginPhoto(BLOB);
    const url = new URLSearchParams(out.split('?')[1]).get('url');
    expect(url).toBe(BLOB);
  });

  it('pide resolución alta y una calidad permitida', () => {
    const params = new URLSearchParams(sameOriginPhoto(BLOB).split('?')[1]);
    expect(Number(params.get('w'))).toBeGreaterThanOrEqual(1920);
    // Debe ser una calidad permitida por next.config: pedir otra devuelve 400.
    expect(params.get('q')).toBe('75');
  });

  it('acepta ancho y calidad a medida', () => {
    const params = new URLSearchParams(sameOriginPhoto(BLOB, 640, 75).split('?')[1]);
    expect(params.get('w')).toBe('640');
    expect(params.get('q')).toBe('75');
  });

  it.each([
    ['data URL', 'data:image/jpeg;base64,/9j/4AAQ'],
    ['blob URL', 'blob:http://localhost:3000/abc-123'],
    ['ruta propia', '/logo.png'],
  ])('deja intacto lo que ya funciona: %s', (_caso, src) => {
    expect(sameOriginPhoto(src)).toBe(src);
  });

  it('no rompe con cadena vacía', () => {
    expect(sameOriginPhoto('')).toBe('');
  });

  it('también enruta otros hosts remotos, no solo el actual', () => {
    // Si mañana las fotos viven en otro sitio, el visor sigue funcionando.
    expect(sameOriginPhoto('https://cdn.ejemplo.com/foto.png')).toContain('/_next/image?url=');
  });

  it('escapa los caracteres especiales de la URL', () => {
    const conEspacios = 'https://cdn.ejemplo.com/mi foto&rara.png';
    const out = sameOriginPhoto(conEspacios);
    expect(out).not.toContain(' ');
    expect(new URLSearchParams(out.split('?')[1]).get('url')).toBe(conEspacios);
  });
});
