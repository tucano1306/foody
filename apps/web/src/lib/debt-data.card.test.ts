// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Juntar y separar los tramos de una tarjeta (`setCardGroup`), contra una base
 * de mentira que entiende justo las consultas que hace la función.
 */

type Fila = { id: string; kind: string; card_group: string | null; user_id: string };
let filas: Fila[] = [];

const U = '00000000-0000-4000-8000-000000000000';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PRESTAMO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

vi.mock('./db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, kind, card_group FROM debts WHERE id =')) {
      return filas.filter((f) => f.id === v[0] && f.user_id === v[1]);
    }
    if (q.startsWith('UPDATE debts SET card_group = NULL, updated_at = now() WHERE id =')) {
      filas = filas.map((f) => (f.id === v[0] ? { ...f, card_group: null } : f));
      return [];
    }
    if (q.startsWith('UPDATE debts SET card_group = ?::uuid')) {
      const [grupo, , x, y] = v as string[];
      filas = filas.map((f) => (f.id === x || f.id === y ? { ...f, card_group: grupo } : f));
      return [];
    }
    if (q.startsWith('UPDATE debts SET card_group = NULL, updated_at = now() WHERE user_id =')) {
      const grupo = v[1] as string;
      const miembros = filas.filter((f) => f.card_group === grupo);
      if (miembros.length === 1) filas = filas.map((f) => (f.card_group === grupo ? { ...f, card_group: null } : f));
      return [];
    }
    return []; // el esquema (CREATE / ALTER / INDEX)
  }),
}));

const { setCardGroup } = await import('./debt-data');

const grupoDe = (id: string) => filas.find((f) => f.id === id)?.card_group ?? null;

beforeEach(() => {
  filas = [
    { id: A, kind: 'credit_card', card_group: null, user_id: U },
    { id: B, kind: 'credit_card', card_group: null, user_id: U },
    { id: C, kind: 'credit_card', card_group: null, user_id: U },
    { id: PRESTAMO, kind: 'loan', card_group: null, user_id: U },
  ];
});

describe('setCardGroup', () => {
  it('juntar dos sueltas: las dos quedan en la misma tarjeta', async () => {
    expect(await setCardGroup(U, B, A)).toEqual({ ok: true });
    expect(grupoDe(A)).toBe(A);
    expect(grupoDe(B)).toBe(A);
  });

  it('un tercer tramo entra en la tarjeta que ya existe', async () => {
    await setCardGroup(U, B, A);
    await setCardGroup(U, C, B);
    expect([grupoDe(A), grupoDe(B), grupoDe(C)]).toEqual([A, A, A]);
  });

  it('sacar un tramo de una tarjeta de dos la deshace: uno solo no es una tarjeta con tramos', async () => {
    await setCardGroup(U, B, A);
    await setCardGroup(U, B, null);
    expect([grupoDe(A), grupoDe(B)]).toEqual([null, null]);
  });

  it('sacar uno de tres deja los otros dos juntos', async () => {
    await setCardGroup(U, B, A);
    await setCardGroup(U, C, A);
    await setCardGroup(U, C, null);
    expect([grupoDe(A), grupoDe(B), grupoDe(C)]).toEqual([A, A, null]);
  });

  it('un préstamo no es tramo de una tarjeta', async () => {
    expect(await setCardGroup(U, PRESTAMO, A)).toEqual(expect.objectContaining({ ok: false, status: 422 }));
    expect(grupoDe(PRESTAMO)).toBeNull();
  });

  it('una deuda de otro usuario no se encuentra', async () => {
    expect(await setCardGroup('otro', A, B)).toEqual(expect.objectContaining({ ok: false, status: 404 }));
  });

  it('una deuda no es tramo de sí misma', async () => {
    expect(await setCardGroup(U, A, A)).toEqual(expect.objectContaining({ ok: false, status: 422 }));
  });
});
