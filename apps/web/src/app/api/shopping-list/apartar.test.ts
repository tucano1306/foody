// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * «No estaba en el súper — quitar de la lista» borraba la fila para siempre,
 * aunque el aviso prometía quitarlo solo «de hoy». El producto seguía faltando
 * en Casa y no volvía nunca a Súper: Casa decía 6 y Súper 4.
 */

const consultas: string[] = [];
/** Si el producto de la fila falta en casa (stock empty/half). */
let faltaEnCasa = true;

vi.mock('@/lib/db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    consultas.push(q);
    // Apartar solo afecta a la fila si el producto falta: lo decide el WHERE.
    if (q.startsWith('UPDATE shopping_list_items sli SET skipped_until')) {
      return faltaEnCasa ? [{ id: 'fila' }] : [];
    }
    if (q.startsWith('DELETE FROM shopping_list_items')) return [{ id: 'fila' }];
    if (q.startsWith('SELECT household_id FROM users')) return [{ household_id: null }];
    // El alta manual con la fila YA existente, como hace Postgres: con
    // `DO UPDATE` el RETURNING trae la fila real; con `DO NOTHING` sale vacío.
    if (q.startsWith('INSERT INTO shopping_list_items')) {
      return q.includes('DO UPDATE') ? [{ id: 'fila-real' }] : [];
    }
    return [];
  }),
}));
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => ({ userId: 'u1' }),
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: () => new Response(null, { status: 404 }),
}));
vi.mock('@/lib/ensure-schema', () => ({ ensureListSkipSchema: async () => undefined }));

const { DELETE } = await import('./[id]/route');
const { POST } = await import('./route');

const quitar = () =>
  DELETE(new NextRequest('http://foody.test/api/shopping-list/fila', { method: 'DELETE' }), {
    params: Promise.resolve({ id: 'fila' }),
  });

beforeEach(() => {
  consultas.length = 0;
  faltaEnCasa = true;
});

describe('DELETE /api/shopping-list/[id] — «No estaba en el súper»', () => {
  it('si el producto falta en casa, lo aparta y NO borra la fila', async () => {
    const res = await quitar();

    expect(res.status).toBe(204);
    expect(consultas.some((q) => q.startsWith('UPDATE shopping_list_items sli SET skipped_until'))).toBe(true);
    expect(consultas.some((q) => q.startsWith('DELETE'))).toBe(false);
  });

  it('solo aparta faltantes: el WHERE lo limita a empty/half', async () => {
    await quitar();
    const apartar = consultas.find((q) => q.startsWith('UPDATE shopping_list_items sli'))!;
    expect(apartar).toContain("p.stock_level IN ('empty', 'half')");
  });

  it('si el producto está lleno (se añadió a mano), borra la fila como siempre', async () => {
    faltaEnCasa = false;
    const res = await quitar();

    expect(res.status).toBe(204);
    expect(consultas.some((q) => q.startsWith('DELETE FROM shopping_list_items'))).toBe(true);
  });
});

describe('POST /api/shopping-list — volver a agregarlo', () => {
  it('reactiva la fila apartada en vez de ignorarla', async () => {
    await POST(
      new NextRequest('http://foody.test/api/shopping-list', {
        method: 'POST',
        body: JSON.stringify({ productId: 'p1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const alta = consultas.find((q) => q.startsWith('INSERT INTO shopping_list_items'))!;
    expect(alta).toContain('ON CONFLICT (user_id, product_id) DO UPDATE');
    expect(alta).toContain('skipped_until = NULL');
  });

  it('devuelve la fila de verdad, no un id inventado', async () => {
    const res = await POST(
      new NextRequest('http://foody.test/api/shopping-list', {
        method: 'POST',
        body: JSON.stringify({ productId: 'p1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await res.json()).toMatchObject({ id: 'fila-real' });
  });
});
