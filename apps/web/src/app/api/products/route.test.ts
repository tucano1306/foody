// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El alta de un producto cuyo nombre ya existe.
 *
 * El usuario da de alta el mismo nombre A PROPÓSITO cuando es otra marca («hay
 * muchas marcas de mantequilla o de huevos»). La ruta fusionaba la segunda con
 * la primera en silencio —y le pisaba el stock—, así que la segunda marca no
 * llegaba a existir. Ahora contesta 409 sin escribir nada, y crea cuando el
 * formulario vuelve con `otraMarca: true`.
 */

/** Todo lo que la ruta le pide a la base, en orden. */
const consultas: string[] = [];
let catalogo: Array<{ id: string; name: string; photo_url: string | null }> = [];

vi.mock('@/lib/db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    consultas.push(q);
    // El catálogo, se pida con foto o sin ella: la simulación representa lo que
    // hay en la base, no una consulta concreta.
    if (/^SELECT id, name(, photo_url)? FROM products/.test(q)) return catalogo;
    if (q.startsWith('SELECT household_id FROM users')) return [{ household_id: null }];
    if (q.startsWith('INSERT INTO products')) return [{ id: valores[0], name: valores[1] }];
    return [];
  }),
}));
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => ({ userId: 'u1' }),
  unauthorized: () => new Response(null, { status: 401 }),
}));
vi.mock('@/lib/ensure-schema', () => ({ ensureProductSharingSchema: async () => undefined }));

const { POST } = await import('./route');

function alta(cuerpo: Record<string, unknown>) {
  return POST(
    new NextRequest('http://foody.test/api/products', {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const escrituras = () => consultas.filter((q) => /^(INSERT|UPDATE|DELETE)/.test(q));

beforeEach(() => {
  consultas.length = 0;
  catalogo = [{ id: 'viejo', name: 'Mantequilla', photo_url: 'https://blob/m.jpg' }];
});

describe('POST /api/products — el nombre ya existe', () => {
  it('contesta 409 con la ficha que ya hay', async () => {
    const res = await alta({ name: 'mantequilla' });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      existing: { id: 'viejo', name: 'Mantequilla', photoUrl: 'https://blob/m.jpg' },
    });
  });

  it('y no escribe NADA: ni crea, ni le pisa el stock a la vieja', async () => {
    await alta({ name: 'Mantequilla' });
    expect(escrituras()).toEqual([]);
  });

  it('con `otraMarca` crea la segunda ficha con el mismo nombre', async () => {
    const res = await alta({ name: 'Mantequilla', otraMarca: true });

    expect(res.status).toBe(201);
    expect(escrituras()).toHaveLength(1);
    expect(escrituras()[0]).toMatch(/^INSERT INTO products/);
  });

  it('un nombre nuevo se crea sin preguntar', async () => {
    const res = await alta({ name: 'Remolachas' });
    expect(res.status).toBe(201);
  });

  it('solo `otraMarca: true` se salta la comprobación, no cualquier cosa', async () => {
    const res = await alta({ name: 'Mantequilla', otraMarca: 'sí' });
    expect(res.status).toBe(409);
  });
});
