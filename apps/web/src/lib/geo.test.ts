import { describe, expect, it } from 'vitest';
import {
  coordenadasValidas,
  decidirTienda,
  detectarTienda,
  distanciaMetros,
  enlaceComoLlegar,
  ordenarPorDistancia,
  textoDistancia,
  type SeleccionTienda,
  type SucursalConPunto,
  centroDe,
} from './geo';

/** Un grado de latitud son ~111 195 m; 0.001° ≈ 111 m. */
const NORTE_M = 111_195 / 1;
const desplazar = (lat: number, lng: number, metrosNorte: number) => ({ lat: lat + metrosNorte / NORTE_M, lng });

const BASE = { lat: 26.0078, lng: -80.2962 };
const publixPines: SucursalConPunto = { id: 'pub-1', nombre: 'Publix', direccion: 'Pines Blvd', ...BASE };
const cvsPlaza: SucursalConPunto = { id: 'cvs-1', nombre: 'CVS', direccion: 'Pines Blvd', ...desplazar(BASE.lat, BASE.lng, 90) };
const publixLejos: SucursalConPunto = { id: 'pub-2', nombre: 'Publix', direccion: 'Sheridan St', ...desplazar(BASE.lat, BASE.lng, 3000) };
const walmart: SucursalConPunto = { id: 'wal-1', nombre: 'Walmart', direccion: null, ...desplazar(BASE.lat, BASE.lng, 8000) };

const en = (metrosNorte: number, precision = 15) => ({ ...desplazar(BASE.lat, BASE.lng, metrosNorte), precision });

describe('distanciaMetros', () => {
  it('mide en metros (haversine)', () => {
    expect(distanciaMetros(BASE, desplazar(BASE.lat, BASE.lng, 1000))).toBeCloseTo(1000, -1);
    expect(distanciaMetros(BASE, BASE)).toBe(0);
    // Miami → Orlando, ~330 km en línea recta.
    expect(distanciaMetros({ lat: 25.7617, lng: -80.1918 }, { lat: 28.5384, lng: -81.3789 }) / 1000).toBeCloseTo(330, -1);
  });
});

describe('coordenadasValidas', () => {
  it('acepta un sitio real y rechaza basura y la isla (0, 0)', () => {
    expect(coordenadasValidas(26.0, -80.3)).toBe(true);
    expect(coordenadasValidas(0, 0)).toBe(false);
    expect(coordenadasValidas(91, 0)).toBe(false);
    expect(coordenadasValidas(10, 181)).toBe(false);
    expect(coordenadasValidas(Number.NaN, 1)).toBe(false);
    expect(coordenadasValidas('26', -80)).toBe(false);
  });
});

describe('detectarTienda', () => {
  const todas = [publixPines, cvsPlaza, publixLejos, walmart];

  it('en la puerta del Publix: ese', () => {
    const d = detectarTienda(en(5), [publixPines, publixLejos, walmart]);
    expect(d).toMatchObject({ tipo: 'una', sucursal: { id: 'pub-1' } });
  });

  it('en el parqueo, a 140 m: todavía cuenta', () => {
    expect(detectarTienda(en(-140), [publixPines, walmart])).toMatchObject({ tipo: 'una', sucursal: { id: 'pub-1' } });
  });

  it('a dos calles: ninguna', () => {
    expect(detectarTienda(en(-600), todas)).toEqual({ tipo: 'ninguna' });
  });

  it('con el GPS recién encendido (±400 m) no decide', () => {
    expect(detectarTienda(en(0, 400), todas)).toEqual({ tipo: 'imprecisa' });
    expect(detectarTienda({ ...en(0), precision: Number.NaN }, todas)).toEqual({ tipo: 'imprecisa' });
  });

  it('el error del GPS amplía el radio, pero con techo', () => {
    // A 185 m con ±40 m: dentro (150 + 40).
    expect(detectarTienda(en(-185, 40), [publixPines]).tipo).toBe('una');
    // A 230 m con ±180 m: fuera; sin techo, entraría.
    expect(detectarTienda(en(-230, 180), [publixPines]).tipo).toBe('ninguna');
  });

  it('Publix y CVS en la misma plaza, en medio del parqueo: pregunta', () => {
    const d = detectarTienda(en(45), todas);
    expect(d.tipo).toBe('varias');
    if (d.tipo === 'varias') expect(d.candidatas.map((c) => c.sucursal.id).sort()).toEqual(['cvs-1', 'pub-1']);
  });

  it('en la puerta de una de las dos, con ventaja clara: esa', () => {
    expect(detectarTienda(en(-10), [publixPines, cvsPlaza])).toMatchObject({ tipo: 'una', sucursal: { id: 'pub-1' } });
  });

  it('dos sucursales del mismo nombre cerca: la más cercana, sin preguntar', () => {
    const otroPublix = { ...publixLejos, id: 'pub-3', ...desplazar(BASE.lat, BASE.lng, 100) };
    expect(detectarTienda(en(40), [publixPines, otroPublix])).toMatchObject({ tipo: 'una', sucursal: { id: 'pub-1' } });
  });

  it('las tiendas sin ubicación no cuentan', () => {
    const sinPunto = { id: 'x', nombre: 'Aldi', direccion: null, lat: null, lng: null };
    expect(detectarTienda(en(0), [sinPunto])).toEqual({ tipo: 'ninguna' });
    expect(ordenarPorDistancia(BASE, [sinPunto, walmart, publixPines]).map((c) => c.sucursal.id)).toEqual(['pub-1', 'wal-1']);
  });
});

describe('decidirTienda — lo elegido a mano manda', () => {
  const una = (s: SucursalConPunto) => ({ tipo: 'una' as const, sucursal: s, distancia: 10 });
  const elegida = (nombre: string, storeId: string | null = null): SeleccionTienda => ({ nombre, storeId, origen: 'elegida' });
  const llegada = (nombre: string, storeId: string): SeleccionTienda => ({ nombre, storeId, origen: 'llegada' });

  it('sin tienda puesta: la pone y avisa', () => {
    expect(decidirTienda(null, una(publixPines))).toEqual({ tipo: 'poner', sucursal: publixPines, origen: 'llegada' });
  });

  it('dijo «voy a Publix» y llegó a un Publix: apunta cuál, sigue siendo elección suya', () => {
    expect(decidirTienda(elegida('publix'), una(publixPines))).toEqual({ tipo: 'poner', sucursal: publixPines, origen: 'elegida' });
  });

  it('eligió Walmart y está en CVS: propone, no pisa', () => {
    expect(decidirTienda(elegida('Walmart', 'wal-1'), una(cvsPlaza))).toEqual({ tipo: 'sugerir', sucursal: cvsPlaza });
  });

  it('si ya dijo que no a esa, no vuelve a proponerla', () => {
    expect(decidirTienda(elegida('Walmart', 'wal-1'), una(cvsPlaza), new Set(['cvs-1']))).toEqual({ tipo: 'nada' });
  });

  it('lo detectado se corrige solo si cambia de tienda', () => {
    expect(decidirTienda(llegada('Publix', 'pub-1'), una(cvsPlaza))).toEqual({ tipo: 'poner', sucursal: cvsPlaza, origen: 'llegada' });
    expect(decidirTienda(llegada('Publix', 'pub-1'), una(publixPines))).toEqual({ tipo: 'nada' });
  });

  it('nada detectado, o GPS impreciso: no toca nada', () => {
    expect(decidirTienda(null, { tipo: 'ninguna' })).toEqual({ tipo: 'nada' });
    expect(decidirTienda(elegida('Walmart'), { tipo: 'imprecisa' })).toEqual({ tipo: 'nada' });
  });

  describe('con varias cerca', () => {
    const varias = {
      tipo: 'varias' as const,
      candidatas: [
        { sucursal: publixPines, distancia: 40 },
        { sucursal: cvsPlaza, distancia: 50 },
      ],
    };

    it('sin tienda puesta: pregunta', () => {
      expect(decidirTienda(null, varias)).toEqual({ tipo: 'preguntar', candidatas: [publixPines, cvsPlaza] });
    });

    it('si una es la que eligió (por nombre o sucursal), se queda con esa', () => {
      expect(decidirTienda(elegida('CVS'), varias)).toEqual({ tipo: 'poner', sucursal: cvsPlaza, origen: 'elegida' });
      expect(decidirTienda(llegada('Publix', 'pub-1'), varias)).toEqual({ tipo: 'nada' });
    });

    it('descartada una, la otra se trata como única', () => {
      expect(decidirTienda(null, varias, new Set(['cvs-1']))).toEqual({ tipo: 'poner', sucursal: publixPines, origen: 'llegada' });
      expect(decidirTienda(elegida('Walmart'), varias, new Set(['pub-1']))).toEqual({ tipo: 'sugerir', sucursal: cvsPlaza });
      expect(decidirTienda(null, varias, new Set(['cvs-1', 'pub-1']))).toEqual({ tipo: 'nada' });
    });
  });
});

describe('textoDistancia y enlaceComoLlegar', () => {
  it('se lee de un vistazo', () => {
    expect(textoDistancia(4)).toBe('a 10 m');
    expect(textoDistancia(84)).toBe('a 80 m');
    expect(textoDistancia(2349)).toBe('a 2,3 km');
    expect(textoDistancia(15_600)).toBe('a 16 km');
    expect(textoDistancia(Number.NaN)).toBe('');
  });

  it('abre la ruta en Google Maps', () => {
    expect(enlaceComoLlegar({ lat: 26.0078, lng: -80.2962 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=26.007800,-80.296200',
    );
  });
});

describe('centroDe', () => {
  it('el punto medio de tus sucursales; sin ninguna, nada', () => {
    expect(centroDe([])).toBeNull();
    expect(centroDe([{ lat: 26, lng: -80 }, { lat: 25, lng: -81 }])).toEqual({ lat: 25.5, lng: -80.5 });
  });
});
