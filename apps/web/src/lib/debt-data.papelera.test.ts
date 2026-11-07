// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La papelera de Deudas, contra una base de mentira que apunta cada sentencia.
 *
 * Lo que se protege: el 7 nov 2026 «Borrar» era un DELETE y en cascada se
 * llevó el libro mayor de unas tarjetas reales. Aquí se prueba que borrar
 * archiva y nada más, que no toca los estados de cuenta ni las condiciones
 * del banco, y que recuperar trae el gesto entero y solo ese gesto.
 */

const U = '00000000-0000-4000-8000-000000000000';
const D = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const G = '11111111-1111-4111-8111-111111111111';

let sentencias: { q: string; v: unknown[] }[] = [];
let devolver: Record<string, unknown>[] = [];

vi.mock('./db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    // El esquema (CREATE / ALTER / INDEX) se ignora: solo interesa lo demás.
    if (/^(CREATE|ALTER|DO)\b/.test(q)) return [];
    sentencias.push({ q, v });
    return devolver;
  }),
}));

const { listarPapelera, mandarDeudaAPapelera, mandarTarjetaAPapelera, restaurarDeLaPapelera } = await import(
  './debt-data'
);

beforeEach(() => {
  sentencias = [];
  devolver = [];
});

describe('borrar es archivar', () => {
  it('una deuda: UPDATE con fecha, de ese usuario, y nada de DELETE', async () => {
    devolver = [{ id: D }];
    expect(await mandarDeudaAPapelera(U, D)).toBe(true);
    expect(sentencias).toHaveLength(1);
    const [s] = sentencias;
    expect(s.q).toMatch(/^UPDATE debts SET status = 'archived', deleted_at = now\(\)/);
    expect(s.q).toContain("status <> 'archived'");
    expect(s.v).toEqual([D, U]);
  });

  it('una deuda que no es del usuario (o ya estaba en la papelera) dice false', async () => {
    devolver = [];
    expect(await mandarDeudaAPapelera(U, D)).toBe(false);
  });

  it('una tarjeta: todos sus tramos en UNA sentencia, sin tocar estados de cuenta ni condiciones', async () => {
    devolver = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(await mandarTarjetaAPapelera(U, G)).toBe(3);
    expect(sentencias).toHaveLength(1);
    expect(sentencias[0].q).toMatch(/^UPDATE debts SET status = 'archived', deleted_at = now\(\)/);
    expect(sentencias[0].q).toContain('card_group = ?::uuid');
    expect(sentencias[0].v).toEqual([U, G]);
    const todo = sentencias.map((x) => x.q).join('\n');
    expect(todo).not.toMatch(/card_statements|credit_terms|DELETE/);
  });
});

describe('recuperar', () => {
  it('trae la deuda y los tramos borrados en el mismo gesto, y dice cuántos', async () => {
    devolver = [{ id: 'a' }, { id: 'b' }];
    expect(await restaurarDeLaPapelera(U, D)).toBe(2);
    const [s] = sentencias;
    expect(s.q).toMatch(/^WITH objetivo AS/);
    // Mismo gesto = misma tarjeta Y misma fecha de borrado.
    expect(s.q).toContain('d.card_group = o.card_group');
    expect(s.q).toContain('d.deleted_at IS NOT DISTINCT FROM o.deleted_at');
    // El estado vuelve a salir del saldo, y la fecha se limpia.
    expect(s.q).toContain("CASE WHEN d.current_balance > 0 THEN 'active' ELSE 'paid_off' END");
    expect(s.q).toContain('deleted_at = NULL');
    expect(s.v).toEqual([D, U, U]);
  });

  it('lo que no está en la papelera del usuario: 0', async () => {
    devolver = [];
    expect(await restaurarDeLaPapelera(U, D)).toBe(0);
  });
});

describe('la lista de la papelera', () => {
  it('solo lo archivado del usuario, lo más reciente primero, con las cifras ya normalizadas', async () => {
    devolver = [
      {
        id: D, name: 'Compras 3650', kind: 'credit_card', issuer: 'Bank of America', account_last4: '3650',
        card_group: G, current_balance: '652.04', currency: 'USD', deleted_at: new Date('2026-11-07T21:40:00Z'),
      },
    ];
    expect(await listarPapelera(U)).toEqual([
      {
        id: D, name: 'Compras 3650', kind: 'credit_card', issuer: 'Bank of America', accountLast4: '3650',
        cardGroup: G, balance: 652.04, currency: 'USD', deletedAt: '2026-11-07T21:40:00.000Z',
      },
    ]);
    expect(sentencias[0].q).toContain("status = 'archived'");
    expect(sentencias[0].q).toContain('ORDER BY deleted_at DESC NULLS LAST');
    expect(sentencias[0].v).toEqual([U]);
  });
});

describe('ninguna deuda se borra de verdad desde la app', () => {
  it('no queda ningún DELETE FROM debts en el código de datos ni en sus rutas', () => {
    // Guardia contra la regresión: si alguien vuelve a escribir un DELETE,
    // este test le cuenta por qué no.
    const src = join(__dirname, '..');
    const archivos = [
      'lib/debt-data.ts',
      'app/api/debts/[id]/route.ts',
      'app/api/debts/cards/[group]/route.ts',
    ];
    for (const a of archivos) {
      expect(readFileSync(join(src, a), 'utf8'), a).not.toMatch(/DELETE\s+FROM\s+debts\b/i);
    }
  });
});
