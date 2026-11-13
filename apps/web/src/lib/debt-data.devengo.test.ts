// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El Plan cobra el interés pendiente antes de leer, contra una base de
 * mentira que apunta cada sentencia.
 *
 * Lo que se protege: una meta enganchada a una tarjeta sale del saldo de la
 * deuda, y ese saldo solo se ponía al día al abrir Deudas. El día que cerraba
 * un ciclo, el Plan decía un «falta» y Deudas otro.
 */

const U = '00000000-0000-4000-8000-000000000000';
const D = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AHORA = new Date(2026, 10, 13, 12);

let sentencias: { q: string; v: unknown[] }[] = [];
let deudas: Record<string, unknown>[] = [];

vi.mock('./db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    if (/^(CREATE|ALTER|DO)\b/.test(q)) return [];
    sentencias.push({ q, v });
    if (q.startsWith('SELECT * FROM debts')) return deudas;
    // El libro mayor, para recalcular el saldo tras el cobro.
    if (q.includes('FROM debt_movements')) return [{ balance: 1020, total_paid: 0 }];
    return [];
  }),
}));

const { devengarPendiente } = await import('./debt-data');

function deuda(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: D, user_id: U, name: 'Saldo nuevo 3650', kind: 'credit_card', status: 'active',
    original_amount: 1000, current_balance: 1000, rate: 24, rate_period: 'annual_nominal',
    strategy: 'minimum', due_day: 22, statement_day: null, promo_ends_on: null,
    opened_at: '2026-06-01T12:00:00.000Z', last_accrual_at: '2026-10-01T12:00:00.000Z',
    created_at: '2026-06-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z',
    ...over,
  };
}

const escrituras = () => sentencias.filter((s) => /^(INSERT|UPDATE|DELETE)\b/.test(s.q));

beforeEach(() => {
  sentencias = [];
  deudas = [];
});

describe('devengarPendiente', () => {
  it('lee solo las deudas vivas de ese usuario', async () => {
    await devengarPendiente(U, AHORA);
    const [s] = sentencias;
    expect(s.q).toMatch(/^SELECT \* FROM debts WHERE user_id = \? AND status = 'active' AND current_balance > 0/);
    expect(s.v).toEqual([U]);
  });

  it('sin nada que cobrar no escribe: una consulta y ya', async () => {
    // Un ciclo que aún no ha cerrado: el último cobro fue hace diez días.
    deudas = [deuda({ last_accrual_at: '2026-11-03T12:00:00.000Z' })];
    expect(await devengarPendiente(U, AHORA)).toBe(false);
    expect(sentencias).toHaveLength(1);
  });

  it('un 0 % vigente no cobra ni toca el libro', async () => {
    deudas = [deuda({ rate: 0, promo_ends_on: '2027-01-25', rate_after_promo: 23.99 })];
    expect(await devengarPendiente(U, AHORA)).toBe(false);
    expect(escrituras()).toHaveLength(0);
  });

  it('con un ciclo cerrado asienta el interés y recalcula el saldo', async () => {
    deudas = [deuda()];
    expect(await devengarPendiente(U, AHORA)).toBe(true);

    const interes = escrituras().filter((s) => s.q.startsWith('INSERT INTO debt_movements'));
    expect(interes.length).toBeGreaterThan(0);
    expect(interes[0].q).toContain("'interest'");
    // Repetirlo no cobra dos veces: lo descarta el índice único por (deuda, mes).
    expect(interes[0].q).toContain('ON CONFLICT DO NOTHING');
    expect(escrituras().some((s) => s.q.startsWith('UPDATE debts SET current_balance'))).toBe(true);
  });

  it('nunca borra nada', async () => {
    deudas = [deuda()];
    await devengarPendiente(U, AHORA);
    expect(sentencias.map((s) => s.q).join('\n')).not.toMatch(/\bDELETE\b/);
  });
});
