import { describe, expect, it } from 'vitest';
import {
  armarTiendas,
  canonizarNombre,
  claveDeTienda,
  elegirNombre,
  etiquetaSucursal,
  lugarDeSucursal,
  quitarVoyA,
  limpiarNombreTienda,
  raizDeTienda,
  sugerirUniones,
  type Sucursal,
  type UsoDeTienda,
} from './tiendas';

/**
 * Los nombres de estas pruebas son los que había en la base el 7 nov 2026:
 * 75 compras con 31 formas de escribir la tienda.
 */

describe('limpiarNombreTienda', () => {
  it('quita espacios de sobra y deja null lo vacío', () => {
    expect(limpiarNombreTienda('  Cvs   Pharmacy ')).toBe('Cvs Pharmacy');
    expect(limpiarNombreTienda('   ')).toBeNull();
    expect(limpiarNombreTienda(42)).toBeNull();
    expect(limpiarNombreTienda(null)).toBeNull();
  });
});

describe('claveDeTienda — el mismo nombre escrito distinto', () => {
  it.each([
    ['Publix', 'publix'],
    ['7eleven', '7-Eleven'],
    ['Cvs  Pharmacy', 'CVS Pharmacy'],
    ['Dollar  tree', 'Dollar Tree'],
    ["McDonald's", 'Mcdonalds'],
    ['Farmacia Camalihé', 'farmacia camalihe'],
  ])('«%s» y «%s» comparten clave', (a, b) => {
    expect(claveDeTienda(a)).toBe(claveDeTienda(b));
  });

  it('CVS y CVS Pharmacy NO comparten clave: no se corrigen solas', () => {
    expect(claveDeTienda('CVS')).not.toBe(claveDeTienda('CVS Pharmacy'));
  });
});

describe('raizDeTienda — para proponer uniones', () => {
  it('quita la palabra genérica del final', () => {
    expect(raizDeTienda('CVS Pharmacy')).toBe('cvs');
    expect(raizDeTienda('Walmart Supercenter')).toBe('walmart');
    expect(raizDeTienda('Publix #1234')).toBe('publix');
  });

  it('no toca la genérica del principio ni deja el nombre vacío', () => {
    expect(raizDeTienda('farmacia Camalihe')).toBe('farmaciacamalihe');
    expect(raizDeTienda('Pharmacy')).toBe('pharmacy');
    expect(raizDeTienda('Market')).toBe('market');
  });
});

describe('canonizarNombre — escribir «publix» guarda «Publix»', () => {
  const conocidos = ['Publix', 'Walmart', '7eleven', 'CVS'];

  it('usa la forma que ya existe', () => {
    expect(canonizarNombre('publix', conocidos)).toBe('Publix');
    expect(canonizarNombre('  PUBLIX ', conocidos)).toBe('Publix');
    expect(canonizarNombre('7-Eleven', conocidos)).toBe('7eleven');
  });

  it('gana la más usada cuando hay varias con la misma clave', () => {
    expect(canonizarNombre('chipotle', ['Chipotle', 'chipotle'])).toBe('Chipotle');
  });

  it('un nombre nuevo se guarda limpio y tal cual', () => {
    expect(canonizarNombre('  Trader   Joe’s ', conocidos)).toBe('Trader Joe’s');
  });

  it('NO convierte CVS Pharmacy en CVS por su cuenta', () => {
    expect(canonizarNombre('CVS Pharmacy', conocidos)).toBe('CVS Pharmacy');
  });

  it('vacío o no texto → null; solo símbolos se guarda tal cual', () => {
    expect(canonizarNombre('   ', conocidos)).toBeNull();
    expect(canonizarNombre(undefined, conocidos)).toBeNull();
    expect(canonizarNombre('???', ['!!!'])).toBe('???');
  });
});

describe('elegirNombre', () => {
  it('la más usada; a igualdad, la que tiene mayúsculas y luego la más corta', () => {
    expect(elegirNombre([{ nombre: 'publix', usos: 2 }, { nombre: 'Publix', usos: 17 }])).toBe('Publix');
    expect(elegirNombre([{ nombre: 'chipotle', usos: 1 }, { nombre: 'Chipotle', usos: 1 }])).toBe('Chipotle');
    expect(elegirNombre([{ nombre: 'CVS Pharmacy', usos: 1 }, { nombre: 'CVS', usos: 1 }])).toBe('CVS');
  });
});

describe('sugerirUniones', () => {
  const reales = [
    { nombre: 'Publix', usos: 17 },
    { nombre: 'publix', usos: 2 },
    { nombre: 'Walmart', usos: 11 },
    { nombre: 'CVS', usos: 2 },
    { nombre: 'Cvs', usos: 1 },
    { nombre: 'Cvs  Pharmacy', usos: 1 },
    { nombre: 'CVS Pharmacy', usos: 1 },
    { nombre: '7eleven', usos: 2 },
    { nombre: '7-Eleven', usos: 1 },
    { nombre: 'Chipotle', usos: 2 },
    { nombre: 'chipotle', usos: 1 },
    { nombre: 'Aldi', usos: 6 },
    { nombre: 'Sin tienda', usos: 4 },
  ];

  it('agrupa las formas de la misma tienda y propone la más usada', () => {
    const grupos = sugerirUniones(reales);
    expect(grupos.map((g) => g.nombre)).toEqual(['Publix', 'CVS', '7eleven', 'Chipotle']);
    const cvs = grupos.find((g) => g.nombre === 'CVS');
    // «Cvs  Pharmacy» llega con dos espacios y se propone ya limpio, que es
    // como quedará escrito si se une así. Las empatadas a 1 van por orden alfabético.
    expect(cvs?.variantes[0]).toEqual({ nombre: 'CVS', usos: 2 });
    expect(cvs?.variantes.map((v) => v.nombre).sort()).toEqual(['CVS', 'CVS Pharmacy', 'Cvs', 'Cvs Pharmacy'].sort());
  });

  it('un nombre único no es grupo, y «Sin tienda» nunca', () => {
    const grupos = sugerirUniones(reales);
    expect(grupos.some((g) => g.nombre === 'Walmart' || g.nombre === 'Aldi')).toBe(false);
    expect(grupos.some((g) => g.variantes.some((v) => v.nombre === 'Sin tienda'))).toBe(false);
  });

  it('sin repetidas, no hay nada que proponer', () => {
    expect(sugerirUniones([{ nombre: 'Publix', usos: 3 }, { nombre: 'Walmart', usos: 1 }])).toEqual([]);
    expect(sugerirUniones([])).toEqual([]);
  });
});

describe('armarTiendas', () => {
  const usos: UsoDeTienda[] = [
    { nombre: 'Publix', kind: 'grocery', usos: 16, ultima: '2026-11-01T15:00:00.000Z' },
    { nombre: 'Publix', kind: 'pharmacy', usos: 1, ultima: '2026-11-05T15:00:00.000Z' },
    { nombre: 'publix', kind: 'grocery', usos: 1, ultima: '2026-06-01T15:00:00.000Z' },
    { nombre: 'Mobil', kind: 'fuel', usos: 2, ultima: '2026-10-01T15:00:00.000Z' },
  ];
  const pines: Sucursal = { id: 's1', nombre: 'publix', direccion: 'Pines Blvd', lat: 26.01, lng: -80.3 };
  const nueva: Sucursal = { id: 's2', nombre: 'Trader Joe’s', direccion: null, lat: 26.1, lng: -80.2 };

  it('suma las compras por nombre, guarda la última y el tipo más frecuente', () => {
    const [publix] = armarTiendas(usos, []);
    expect(publix).toMatchObject({ nombre: 'Publix', usos: 17, ultima: '2026-11-05T15:00:00.000Z', kind: 'grocery' });
    expect(armarTiendas(usos, []).find((t) => t.nombre === 'Mobil')?.kind).toBe('fuel');
  });

  it('cuelga la sucursal del nombre con su clave y más compras', () => {
    const tiendas = armarTiendas(usos, [pines]);
    expect(tiendas.find((t) => t.nombre === 'Publix')?.sucursales).toEqual([{ ...pines, nombre: 'Publix' }]);
    expect(tiendas.find((t) => t.nombre === 'publix')?.sucursales).toEqual([]);
  });

  it('una sucursal sin compras todavía sale como tienda con 0 compras', () => {
    const tiendas = armarTiendas(usos, [nueva]);
    expect(tiendas.at(-1)).toMatchObject({ nombre: 'Trader Joe’s', usos: 0, ultima: null, sucursales: [nueva] });
  });

  it('ignora nombres vacíos y usos que no son números', () => {
    const tiendas = armarTiendas(
      [
        { nombre: '  ', kind: 'grocery', usos: 3, ultima: null },
        { nombre: 'Aldi', kind: 'raro', usos: Number.NaN, ultima: null },
      ],
      [],
    );
    expect(tiendas).toEqual([{ nombre: 'Aldi', usos: 0, ultima: null, kind: 'grocery', sucursales: [] }]);
  });
});

describe('quitarVoyA', () => {
  it('deja solo la tienda de lo dictado', () => {
    expect(quitarVoyA('Voy a Publix')).toBe('Publix');
    expect(quitarVoyA('voy al Walmart.')).toBe('Walmart');
    expect(quitarVoyA('me voy para el CVS')).toBe('CVS');
    expect(quitarVoyA('Estoy en el Aldi')).toBe('Aldi');
    expect(quitarVoyA('vamos a Trader Joe’s')).toBe('Trader Joe’s');
  });

  it('sin la frase delante no toca nada', () => {
    expect(quitarVoyA('  Publix  ')).toBe('Publix');
    // «La Placita» empieza por artículo, pero no lleva «voy a»: se respeta.
    expect(quitarVoyA('La Placita')).toBe('La Placita');
    expect(quitarVoyA('Voyager Market')).toBe('Voyager Market');
  });

  it('la frase sola no deja tienda', () => {
    expect(quitarVoyA('voy a ')).toBe('');
  });
});

describe('etiquetaSucursal', () => {
  it('nombre y calle, sin el número de portal', () => {
    expect(etiquetaSucursal({ nombre: 'Publix', direccion: '12800 Biscayne Boulevard, North Miami' })).toBe(
      'Publix · Biscayne Boulevard',
    );
    expect(lugarDeSucursal({ direccion: 'Pines Blvd' })).toBe('Pines Blvd');
  });

  it('sin dirección, solo el nombre; un portal suelto se queda', () => {
    expect(etiquetaSucursal({ nombre: 'Aldi', direccion: null })).toBe('Aldi');
    expect(etiquetaSucursal({ nombre: 'Aldi', direccion: '  ' })).toBe('Aldi');
    expect(lugarDeSucursal({ direccion: '12800' })).toBe('12800');
  });
});
