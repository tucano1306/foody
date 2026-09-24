import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * El service worker servía `GET /api/proxy/products` con stale-while-revalidate
 * aunque quien llamaba pidiera `cache: 'no-store'`. Devolvía la copia vieja y
 * guardaba la nueva para la vez SIGUIENTE: en Súper, «añadir de tu despensa» no
 * enseñaba el producto recién creado hasta cerrar y volver a abrir la hoja.
 *
 * Se prueba el `sw.js` de verdad, cargado en una caja de arena con una caché y
 * una red de mentira, no una copia de su lógica.
 */

const SW = readFileSync(join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');

type Handler = (event: unknown) => void;

function montar(opciones: { enCache?: string; red: 'ok' | 'caida' }) {
  const handlers = new Map<string, Handler>();
  const cache = {
    match: async () => (opciones.enCache === undefined ? undefined : new Response(opciones.enCache)),
    put: async () => undefined,
  };
  const sandbox = {
    addEventListener: (tipo: string, fn: Handler) => handlers.set(tipo, fn),
    caches: { open: async () => cache, match: cache.match },
    fetch: async () => {
      if (opciones.red === 'caida') throw new TypeError('sin red');
      return new Response('lista NUEVA');
    },
    location: { origin: 'https://foody.test' },
    Response,
    URL,
  };
  (sandbox as Record<string, unknown>).globalThis = sandbox;
  runInNewContext(SW, sandbox);

  /** Pide la lista como lo hace la app y devuelve el texto que recibe. */
  return async function pedir(cacheMode: RequestCache = 'default'): Promise<string> {
    let respuesta: Promise<Response> | undefined;
    handlers.get('fetch')!({
      request: {
        method: 'GET',
        url: 'https://foody.test/api/proxy/products',
        mode: 'cors',
        destination: '',
        cache: cacheMode,
        headers: new Headers(),
      },
      respondWith: (p: Promise<Response>) => { respuesta = p; },
    });
    if (!respuesta) throw new Error('el service worker no respondió');
    return (await respuesta).text();
  };
}

describe('service worker — la lista de productos', () => {
  it('con `no-store` trae la lista de AHORA, no la que había en caché', async () => {
    const pedir = montar({ enCache: 'lista VIEJA', red: 'ok' });
    expect(await pedir('no-store')).toBe('lista NUEVA');
  });

  it('sin pedir nada especial sigue sirviendo primero la caché', async () => {
    // Es lo que hace útil la app en el super cuando se va la señal: no se toca.
    const pedir = montar({ enCache: 'lista VIEJA', red: 'ok' });
    expect(await pedir()).toBe('lista VIEJA');
  });

  it('con `no-store` y sin red, cae a la caché en vez de romperse', async () => {
    const pedir = montar({ enCache: 'lista VIEJA', red: 'caida' });
    expect(await pedir('no-store')).toBe('lista VIEJA');
  });
});
