import { describe, expect, it } from 'vitest';
import { matchesQuery, matchesWords, normalizeSearchText, searchWords } from './text-search';

describe('normalizeSearchText', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(normalizeSearchText('Jabón LÍQUIDO')).toBe('jabon liquido');
  });

  it('convierte los signos en espacio, sin partir palabras enteras', () => {
    expect(normalizeSearchText('crema-dental')).toBe('crema dental');
    expect(normalizeSearchText('Leche 2% (1L)')).toBe('leche 2 1l');
    expect(normalizeSearchText('lavaplatos')).toBe('lavaplatos');
  });

  it('junta los espacios de sobra', () => {
    expect(normalizeSearchText('  crema    dental  ')).toBe('crema dental');
  });

  it('con texto vacío devuelve vacío', () => {
    expect(normalizeSearchText('')).toBe('');
    expect(normalizeSearchText('   ')).toBe('');
    expect(normalizeSearchText('!!!')).toBe('');
  });
});

describe('searchWords', () => {
  it('trocea en palabras normalizadas', () => {
    expect(searchWords('Crema Dental')).toEqual(['crema', 'dental']);
  });

  it('una búsqueda vacía no tiene palabras', () => {
    expect(searchWords('')).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });
});

/** El caso que motivó todo esto. */
describe('buscar «crema dental»', () => {
  const producto = 'Hello Crema Dental Herbal';

  it('lo encuentra sin teclear el nombre completo', () => {
    expect(matchesQuery(producto, 'crema dental')).toBe(true);
  });

  it('lo encuentra con las palabras al revés', () => {
    expect(matchesQuery(producto, 'dental crema')).toBe(true);
  });

  it('lo encuentra tecleando a medias', () => {
    expect(matchesQuery(producto, 'cre den')).toBe(true);
  });

  it('lo encuentra con guion en medio', () => {
    expect(matchesQuery(producto, 'crema-dental')).toBe(true);
  });

  it('sigue encontrándolo con el nombre entero, como antes', () => {
    expect(matchesQuery(producto, 'Hello Crema Dental')).toBe(true);
  });

  it('NO lo encuentra si falta alguna palabra de la búsqueda', () => {
    // Todas las palabras tienen que estar: si no, buscar sería inútil.
    expect(matchesQuery(producto, 'crema dental colgate')).toBe(false);
  });
});

describe('matchesWords', () => {
  it('ignora acentos en las dos direcciones', () => {
    expect(matchesWords('Jabón', searchWords('jabon'))).toBe(true);
    expect(matchesWords('Jabon', searchWords('jabón'))).toBe(true);
  });

  it('una búsqueda vacía no esconde nada', () => {
    expect(matchesWords('lo que sea', [])).toBe(true);
  });

  it('funciona sobre un texto compuesto de varios campos', () => {
    // Así es como se usa: nombre + categoría + descripción en un solo texto.
    const hay = 'Hello Crema Dental Herbal · Higiene y cuidado · para las muelas';
    expect(matchesWords(hay, searchWords('dental higiene'))).toBe(true);
    expect(matchesWords(hay, searchWords('dental muelas'))).toBe(true);
  });
})
