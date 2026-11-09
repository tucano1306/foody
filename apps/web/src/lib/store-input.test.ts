import { describe, expect, it } from 'vitest';
import {
  leerBusqueda,
  leerCambioDeSucursal,
  leerPuntoDeConsulta,
  leerSucursalNueva,
  leerUnion,
  MAXIMO_VARIANTES,
} from './store-input';

describe('leerSucursalNueva', () => {
  it('una sucursal con ubicación', () => {
    expect(leerSucursalNueva({ name: '  Publix ', address: ' 12800  Biscayne Blvd ', latitude: 25.89, longitude: -80.16 })).toEqual({
      ok: true,
      valor: { nombre: 'Publix', direccion: '12800 Biscayne Blvd', lat: 25.89, lng: -80.16 },
    });
  });

  it('una tienda sin ubicación también vale', () => {
    expect(leerSucursalNueva({ name: 'Amazon' })).toEqual({
      ok: true,
      valor: { nombre: 'Amazon', direccion: null, lat: null, lng: null },
    });
  });

  it.each([
    [null, 'Faltan los datos de la tienda'],
    [[], 'Faltan los datos de la tienda'],
    [{ name: '   ' }, 'Ponle nombre a la tienda'],
    [{ name: 'x'.repeat(256) }, 'El nombre es demasiado largo'],
    [{ name: 'Publix', address: 7 }, 'La dirección no es válida'],
    [{ name: 'Publix', address: 'x'.repeat(501) }, 'La dirección es demasiado larga'],
    [{ name: 'Publix', latitude: 25.8 }, 'La ubicación no es válida'],
    [{ name: 'Publix', latitude: 0, longitude: 0 }, 'La ubicación no es válida'],
    [{ name: 'Publix', latitude: '25.8', longitude: '-80.1' }, 'La ubicación no es válida'],
    [{ name: 'Publix', latitude: 95, longitude: -80.1 }, 'La ubicación no es válida'],
  ])('%j → %s', (body, error) => {
    expect(leerSucursalNueva(body)).toEqual({ ok: false, error });
  });
});

describe('leerCambioDeSucursal', () => {
  it('cambia la dirección, la ubicación o ambas', () => {
    expect(leerCambioDeSucursal({ address: 'Sheridan St' })).toEqual({ ok: true, valor: { direccion: 'Sheridan St' } });
    expect(leerCambioDeSucursal({ address: '' })).toEqual({ ok: true, valor: { direccion: null } });
    expect(leerCambioDeSucursal({ latitude: 26, longitude: -80.2 })).toEqual({ ok: true, valor: { lat: 26, lng: -80.2 } });
  });

  it('no renombra ni deja una sucursal sin ubicación', () => {
    expect(leerCambioDeSucursal({ name: 'Otro' })).toEqual({ ok: false, error: 'No hay nada que cambiar' });
    expect(leerCambioDeSucursal({ latitude: null, longitude: null })).toEqual({ ok: false, error: 'La ubicación no es válida' });
    expect(leerCambioDeSucursal({ latitude: 26 })).toEqual({ ok: false, error: 'La ubicación no es válida' });
    expect(leerCambioDeSucursal('x')).toEqual({ ok: false, error: 'Faltan los datos de la tienda' });
  });
});

describe('leerUnion', () => {
  it('limpia y quita repetidas', () => {
    expect(leerUnion({ name: ' CVS ', variants: ['Cvs', 'Cvs  Pharmacy', 'Cvs Pharmacy', 'CVS'] })).toEqual({
      ok: true,
      valor: { nombre: 'CVS', variantes: ['Cvs', 'Cvs Pharmacy', 'CVS'] },
    });
  });

  it('renombrar es unir una sola', () => {
    expect(leerUnion({ name: 'Publix', variants: ['publix'] })).toEqual({ ok: true, valor: { nombre: 'Publix', variantes: ['publix'] } });
  });

  it.each([
    [{ variants: ['a'] }, 'Ponle nombre a la tienda'],
    [{ name: 'CVS' }, 'Faltan las tiendas que unir'],
    [{ name: 'CVS', variants: [] }, 'Faltan las tiendas que unir'],
    [{ name: 'CVS', variants: ['Cvs', '  '] }, 'Una de las tiendas no es válida'],
    [{ name: 'CVS', variants: ['Cvs', 3] }, 'Una de las tiendas no es válida'],
    [{ name: 'CVS', variants: Array.from({ length: MAXIMO_VARIANTES + 1 }, (_, i) => `t${i}`) }, 'Son demasiadas tiendas a la vez'],
  ])('%j → %s', (body, error) => {
    expect(leerUnion(body)).toEqual({ ok: false, error });
  });
});

describe('leerBusqueda y leerPuntoDeConsulta', () => {
  it('la búsqueda pide al menos dos letras y tiene techo', () => {
    expect(leerBusqueda('  publix  ')).toEqual({ ok: true, valor: 'publix' });
    expect(leerBusqueda('p')).toEqual({ ok: false, error: 'Escribe al menos dos letras' });
    expect(leerBusqueda(null)).toEqual({ ok: false, error: 'Escribe al menos dos letras' });
    expect(leerBusqueda('x'.repeat(101))).toEqual({ ok: false, error: 'La búsqueda es demasiado larga' });
  });

  it('el punto es opcional; si viene, tiene que ser válido', () => {
    expect(leerPuntoDeConsulta(null, null)).toEqual({ ok: true, valor: null });
    expect(leerPuntoDeConsulta('', '')).toEqual({ ok: true, valor: null });
    expect(leerPuntoDeConsulta('26.01', '-80.3')).toEqual({ ok: true, valor: { lat: 26.01, lng: -80.3 } });
    expect(leerPuntoDeConsulta('26.01', null)).toEqual({ ok: false, error: 'La ubicación no es válida' });
    expect(leerPuntoDeConsulta('abc', '-80')).toEqual({ ok: false, error: 'La ubicación no es válida' });
  });
});
