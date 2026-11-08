import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENTE,
  BuscadorNoDisponible,
  consultarNominatim,
  direccionCorta,
  leerInversa,
  leerResultados,
  redondearCentro,
  reiniciarBuscador,
  urlDeBusqueda,
  urlInversa,
  type Dependencias,
} from './osm';

/**
 * Las respuestas de estas pruebas tienen la forma de las reales de Nominatim
 * (consultadas el 8 nov 2026 buscando «Publix» cerca de Pembroke Pines).
 */
const respuestaReal = [
  {
    name: 'Publix',
    lat: '25.8942644',
    lon: '-80.1636171',
    display_name: 'Publix, 12800, Biscayne Boulevard, Keystone Islands, North Miami, Miami-Dade County, Florida, 33181, United States',
    address: { shop: 'Publix', house_number: '12800', road: 'Biscayne Boulevard', city: 'North Miami' },
  },
  {
    name: 'Publix',
    lat: '25.8837753',
    lon: '-80.3092858',
    display_name: 'Publix, 1290, West 68th Street, Hialeah, Florida',
    address: { house_number: '1290', road: 'West 68th Street', city: 'Hialeah' },
  },
];

describe('URLs', () => {
  it('la búsqueda va acotada a ~22 km de donde estás, con el centro redondeado', () => {
    const url = urlDeBusqueda('Publix', { lat: 26.00781, lng: -80.29624 });
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('Publix');
    expect(url.searchParams.get('viewbox')).toBe('-80.50,26.21,-80.10,25.81');
    expect(url.searchParams.get('bounded')).toBe('1');
    // Tu posición exacta no sale de la app.
    expect(url.toString()).not.toContain('26.00781');
    expect(redondearCentro({ lat: 26.00781, lng: -80.29624 })).toEqual({ lat: 26.01, lng: -80.3 });
  });

  it('sin posición, busca sin caja', () => {
    const url = urlDeBusqueda('Publix Pembroke Pines', null);
    expect(url.searchParams.has('viewbox')).toBe(false);
    expect(url.searchParams.has('bounded')).toBe(false);
  });

  it('la inversa pide el detalle de edificio', () => {
    const url = urlInversa({ lat: 25.8942644, lng: -80.1636171 });
    expect(url.pathname).toBe('/reverse');
    expect(url.searchParams.get('zoom')).toBe('18');
  });
});

describe('lectura de respuestas', () => {
  it('direccionCorta: número, calle y ciudad', () => {
    expect(direccionCorta(respuestaReal[0].address)).toBe('12800 Biscayne Boulevard, North Miami');
    expect(direccionCorta({ road: 'Pines Blvd' })).toBe('Pines Blvd');
    expect(direccionCorta({ town: 'Davie' })).toBe('Davie');
    expect(direccionCorta({})).toBeNull();
    expect(direccionCorta(null)).toBeNull();
  });

  it('ordena por cercanía, no por «importancia»', () => {
    const cerca = leerResultados(respuestaReal, { lat: 25.88, lng: -80.31 });
    expect(cerca.map((l) => l.direccion)).toEqual(['1290 West 68th Street, Hialeah', '12800 Biscayne Boulevard, North Miami']);
    expect(cerca[0].distancia).toBeLessThan(1000);
    expect(cerca[0]).toMatchObject({ nombre: 'Publix', lat: 25.8837753, lng: -80.3092858 });
  });

  it('salta filas sin coordenadas o sin nombre, y respeta el máximo', () => {
    const lugares = leerResultados(
      [{ lat: 'x', lon: '1', name: 'A' }, { lat: '26', lon: '-80' }, null, ...respuestaReal, ...respuestaReal, ...respuestaReal],
      null,
      4,
    );
    expect(lugares).toHaveLength(4);
    expect(lugares[0].distancia).toBeNull();
    expect(leerResultados({ error: 'x' }, null)).toEqual([]);
  });

  it('sin `name`, usa lo primero de display_name', () => {
    const [l] = leerResultados([{ lat: '26', lon: '-80', display_name: 'Aldi, 100, Main St, Davie' }], null);
    expect(l).toMatchObject({ nombre: 'Aldi', direccion: '100, Main St' });
  });

  it('inversa: nombre del sitio y dirección corta', () => {
    expect(
      leerInversa({ name: 'Publix', address: { house_number: '12800', road: 'Biscayne Boulevard', town: 'North Miami' } }),
    ).toEqual({ nombre: 'Publix', direccion: '12800 Biscayne Boulevard, North Miami' });
    expect(leerInversa('nada')).toEqual({ nombre: null, direccion: null });
  });
});

describe('consultarNominatim — una por segundo, con caché', () => {
  let reloj = 1_000_000;
  const esperas: number[] = [];
  const fetchFalso = vi.fn<typeof fetch>();
  const deps: Dependencias = {
    fetch: fetchFalso,
    ahora: () => reloj,
    esperar: async (ms) => {
      esperas.push(ms);
      reloj += ms;
    },
  };

  beforeEach(() => {
    reiniciarBuscador();
    reloj = 1_000_000;
    esperas.length = 0;
    fetchFalso.mockReset();
    fetchFalso.mockImplementation(async () => Response.json(respuestaReal));
  });

  it('se identifica como Foody, sin datos del dueño', async () => {
    await consultarNominatim(new URL('https://nominatim.openstreetmap.org/search?q=a'), deps);
    const init = fetchFalso.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(AGENTE);
    expect(AGENTE).not.toMatch(/@/);
  });

  it('dos búsquedas seguidas: la segunda espera su turno', async () => {
    await consultarNominatim(new URL('https://nominatim.openstreetmap.org/search?q=a'), deps);
    await consultarNominatim(new URL('https://nominatim.openstreetmap.org/search?q=b'), deps);
    expect(esperas).toEqual([1100]);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('la misma búsqueda no vuelve a salir', async () => {
    const url = new URL('https://nominatim.openstreetmap.org/search?q=publix');
    await consultarNominatim(url, deps);
    reloj += 60_000;
    expect(await consultarNominatim(url, deps)).toEqual(respuestaReal);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('si el buscador falla, error propio (la ruta responde 502)', async () => {
    fetchFalso.mockImplementationOnce(async () => new Response('slow down', { status: 429 }));
    await expect(consultarNominatim(new URL('https://nominatim.openstreetmap.org/search?q=c'), deps)).rejects.toBeInstanceOf(
      BuscadorNoDisponible,
    );
    fetchFalso.mockImplementationOnce(async () => {
      throw new TypeError('network');
    });
    await expect(consultarNominatim(new URL('https://nominatim.openstreetmap.org/search?q=d'), deps)).rejects.toBeInstanceOf(
      BuscadorNoDisponible,
    );
  });
});
