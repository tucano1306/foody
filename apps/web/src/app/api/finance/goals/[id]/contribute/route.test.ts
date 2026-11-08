// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Un aporte a una meta enganchada a una deuda viva se guardaba, se pisaba en
 * la siguiente carga (la meta lee el saldo de la deuda) y la tarjeta seguía
 * igual en Deudas. Aquí se prueba que la ruta lo rechaza sin escribir nada, y
 * que una meta suelta sigue aceptando aportes como siempre.
 */

type Fila = Record<string, unknown>;
const sentencias: string[] = [];
let respuestas: Fila[][] = [];
vi.mock('@/lib/db', () => ({
  sql: (strings: TemplateStringsArray) => {
    sentencias.push(strings.join('?').replace(/\s+/g, ' ').trim());
    return Promise.resolve(respuestas.shift() ?? []);
  },
}));
vi.mock('@/lib/finance-data', () => ({
  ensureFinanceSchema: async () => undefined,
  mapGoalRow: (r: Fila) => ({ id: r.id, savedAmount: Number(r.saved_amount) }),
}));
let logueado = true;
vi.mock('@/lib/route-helpers', () => ({
  getRouteUser: async () => (logueado ? { userId: 'u1' } : null),
  unauthorized: () => new Response(null, { status: 401 }),
  notFound: (m: string) => Response.json({ message: m }, { status: 404 }),
}));

const { POST } = await import('./route');

const ID = '33333333-3333-4333-8333-333333333333';

function aportar(id: string, body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/finance/goals/${id}/contribute`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const escrituras = () => sentencias.filter((s) => /^(UPDATE|INSERT|DELETE)\b/i.test(s));

beforeEach(() => {
  sentencias.length = 0;
  respuestas = [];
  logueado = true;
});

describe('POST /api/finance/goals/[id]/contribute', () => {
  it('sin sesión, 401', async () => {
    logueado = false;
    expect((await aportar(ID, { amount: 50 })).status).toBe(401);
    expect(sentencias).toHaveLength(0);
  });

  it('un id que no es uuid no llega a la base', async () => {
    expect((await aportar('no-es-uuid', { amount: 50 })).status).toBe(404);
    expect(sentencias).toHaveLength(0);
  });

  it('una meta suelta acepta el aporte y lo apunta en su historial', async () => {
    respuestas = [[{ id: ID, saved_amount: '150' }], []];
    const res = await aportar(ID, { amount: 50, note: 'quincena' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, savedAmount: 150 });
    expect(escrituras()).toHaveLength(2);
    expect(escrituras()[1]).toMatch(/^INSERT INTO finance_goal_contributions/);
  });

  it('el UPDATE solo toca la meta si NO sigue a una deuda viva', async () => {
    respuestas = [[{ id: ID, saved_amount: '150' }], []];
    await aportar(ID, { amount: 50 });
    const update = escrituras()[0];
    expect(update).toMatch(/^UPDATE finance_goals/);
    expect(update).toMatch(/NOT EXISTS \( SELECT 1 FROM debts d WHERE d\.id = g\.debt_id .*d\.status <> 'archived' \)/);
  });

  it('enganchada a una deuda viva: 409, y no se apunta ningún aporte', async () => {
    // El UPDATE no devuelve filas (la deuda está viva) y la meta sí existe.
    respuestas = [[], [{ '?column?': 1 }]];
    const res = await aportar(ID, { amount: 50 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Deudas/);
    expect(escrituras().some((s) => /INSERT INTO finance_goal_contributions/.test(s))).toBe(false);
  });

  it('una meta ajena o que no existe es un 404, no un 409', async () => {
    respuestas = [[], []];
    expect((await aportar(ID, { amount: 50 })).status).toBe(404);
  });

  it('JSON roto, 400; monto cero o no numérico, 422', async () => {
    expect((await aportar(ID, '{')).status).toBe(400);
    expect((await aportar(ID, { amount: 0 })).status).toBe(422);
    expect((await aportar(ID, { amount: 'mucho' })).status).toBe(422);
    expect(escrituras()).toHaveLength(0);
  });
});
