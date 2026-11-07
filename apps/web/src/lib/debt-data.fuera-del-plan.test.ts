// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Quitar una tarjeta del Plan, contra una base de mentira que apunta cada
 * sentencia.
 *
 * Lo que se protege: el dueño pidió quitar sus tarjetas del Plan «con
 * seguridad de que no se me van a borrar en la sección de deudas». El 7 nov
 * 2026 lo único que había era «Borrar», y se las llevó de Deudas. Aquí se
 * prueba que quitar y devolver escriben SOLO en `plan_hidden_accounts`: a
 * `debts` no le llega ni un UPDATE, ni un DELETE, ni un INSERT.
 */

const U = '00000000-0000-4000-8000-000000000000';
const G = '339896bb-13c0-4337-aed2-914c7c099954';
const COMPRAS = '5b624994-e8d8-4e7f-926e-7f81447853f3';
const NUEVO = '2a517f16-39a9-4b05-8a07-a1c776a7f080';
const SUELTA = '5d4bb3a7-2a16-4e53-87bc-10ea15155730';

let sentencias: { q: string; v: unknown[] }[] = [];
let responder: (q: string) => unknown = () => [];

vi.mock('./db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    // El esquema (CREATE / ALTER / DO) se ignora: solo interesa lo demás.
    if (/^(CREATE|ALTER|DO)\b/.test(q)) return [];
    sentencias.push({ q, v });
    return responder(q);
  }),
}));

const { listCreditsForPlan, ponerEnElPlan } = await import('./debt-data');

/** Ninguna sentencia escribe en `debts`. */
function noTocaDeudas() {
  for (const { q } of sentencias) {
    expect(q).not.toMatch(/^(UPDATE|DELETE FROM|INSERT INTO)\s+debts\b/i);
    expect(q).not.toMatch(/DELETE\s+FROM\s+debts\b|UPDATE\s+debts\b|INSERT\s+INTO\s+debts\b/i);
  }
}

/** Lo que escribe, para ver que todo va a `plan_hidden_accounts`. */
const escrituras = () => sentencias.filter((s) => /^(UPDATE|DELETE|INSERT)\b/.test(s.q));

const tarjeta = [
  { id: G, card_group: G },
  { id: COMPRAS, card_group: G },
  { id: NUEVO, card_group: G },
];

beforeEach(() => {
  sentencias = [];
  responder = () => [];
});

describe('quitar del Plan', () => {
  it('una tarjeta con tramos: guarda la clave de la TARJETA aunque se toque un tramo', async () => {
    responder = (q) => (q.startsWith('SELECT t.id') ? tarjeta : []);
    expect(await ponerEnElPlan(U, COMPRAS, false)).toBe(G);

    const [lectura, insercion] = sentencias;
    expect(lectura.q).toMatch(/^SELECT t\.id, t\.card_group FROM debts d JOIN debts t/);
    // Solo lo del usuario y nunca lo de la papelera.
    expect(lectura.q).toContain("d.user_id = ? AND d.status <> 'archived'");
    expect(lectura.v).toEqual([COMPRAS, U]);

    expect(insercion.q).toBe(
      'INSERT INTO plan_hidden_accounts (user_id, account_key) VALUES (?, ?::uuid) ON CONFLICT (user_id, account_key) DO NOTHING',
    );
    expect(insercion.v).toEqual([U, G]);
    expect(escrituras()).toHaveLength(1);
    noTocaDeudas();
  });

  it('una tarjeta suelta: su propio id', async () => {
    responder = (q) => (q.startsWith('SELECT t.id') ? [{ id: SUELTA, card_group: null }] : []);
    expect(await ponerEnElPlan(U, SUELTA, false)).toBe(SUELTA);
    expect(escrituras()[0].v).toEqual([U, SUELTA]);
    noTocaDeudas();
  });

  it('una deuda de otro usuario, inexistente o en la papelera: null y no escribe nada', async () => {
    responder = () => [];
    expect(await ponerEnElPlan(U, COMPRAS, false)).toBeNull();
    expect(escrituras()).toHaveLength(0);
    noTocaDeudas();
  });
});

describe('devolver al Plan', () => {
  it('borra la clave de la tarjeta y la de cada tramo, solo de ese usuario, y solo de plan_hidden_accounts', async () => {
    responder = (q) => (q.startsWith('SELECT t.id') ? tarjeta : []);
    expect(await ponerEnElPlan(U, NUEVO, true)).toBe(G);

    const [borrado] = escrituras();
    expect(borrado.q).toBe('DELETE FROM plan_hidden_accounts WHERE user_id = ? AND account_key = ANY(?::uuid[])');
    expect(borrado.v[0]).toBe(U);
    expect([...(borrado.v[1] as string[])].sort()).toEqual([G, COMPRAS, NUEVO].sort());
    expect(escrituras()).toHaveLength(1);
    noTocaDeudas();
  });
});

describe('lo que lee el Plan', () => {
  const fila = (id: string, name: string, cardGroup: string | null, balance: string) => ({
    id, name, current_balance: balance, rate: '0', rate_period: 'annual_nominal', strategy: 'minimum',
    term_months: null, payoff_date: null, custom_payment: null, min_percent: '1', min_floor: '35',
    min_includes_interest: false, extra_monthly: '0', business_share: '0', promo_ends_on: null,
    rate_after_promo: null, cycle_days: 31, linked_payment_id: null, duplicate_dismissed: false,
    issuer: 'Bank of America', card_group: cardGroup, kind: 'credit_card', account_last4: '3650',
    currency: 'USD', promo_kind: 'cero', deferred_interest: null, opened_at: null,
  });
  const filas = [
    fila(G, 'Unlimited Cash 3650', G, '11286.00'),
    fila(COMPRAS, 'Compras 3650', G, '652.04'),
    fila(SUELTA, 'Cash Rewards 8523', null, '1941.94'),
  ];

  it('marca fuera del Plan la tarjeta entera guardada, y deja la otra', async () => {
    responder = (q) => {
      if (q.startsWith('SELECT account_key FROM plan_hidden_accounts')) return [{ account_key: G }];
      return filas;
    };
    const creditos = await listCreditsForPlan(U);
    expect(creditos.map((c) => [c.name, c.fueraDelPlan])).toEqual([
      ['Unlimited Cash 3650', true],
      ['Compras 3650', true],
      ['Cash Rewards 8523', false],
    ]);
    // Siguen llegando las tres: el motor cuenta su cuota aunque no se listen.
    expect(creditos).toHaveLength(3);
    noTocaDeudas();
  });

  it('si la lectura de lo quitado falla, el Plan las enseña todas en vez de caerse', async () => {
    responder = (q) => {
      if (q.startsWith('SELECT account_key')) throw new Error('relation "plan_hidden_accounts" does not exist');
      return filas;
    };
    const creditos = await listCreditsForPlan(U);
    expect(creditos.every((c) => !c.fueraDelPlan)).toBe(true);
    expect(creditos).toHaveLength(3);
  });
});

describe('desde el Plan no se puede borrar una deuda', () => {
  it('ningún componente del Plan llama a DELETE sobre /api/debts', () => {
    // El accidente del 7 nov empezó en el Plan. Ahora borrar una deuda solo se
    // puede en Deudas: si alguien vuelve a poner un DELETE aquí, este test le
    // cuenta por qué no.
    const carpeta = join(__dirname, '..', 'components', 'finance');
    const archivos = readdirSync(carpeta).filter((a) => a.endsWith('.tsx') && !a.includes('.test.'));
    expect(archivos.length).toBeGreaterThan(5);
    for (const a of archivos) {
      const texto = readFileSync(join(carpeta, a), 'utf8');
      // Cada fetch a /api/debts con su bloque de opciones: ninguno es DELETE.
      for (const llamada of texto.match(/fetch\(\s*`?['"]?\/api\/debts[^)]*\)?[^;]*/g) ?? []) {
        expect(llamada, a).not.toMatch(/method:\s*'DELETE'/);
      }
    }
  });

  it('quitar del Plan no tiene ninguna sentencia que escriba en debts', () => {
    const src = readFileSync(join(__dirname, 'debt-data.ts'), 'utf8');
    const inicio = src.indexOf('export async function ponerEnElPlan');
    // El final de la función: la primera llave de cierre en columna 0, con
    // saltos de línea de Windows o de Unix.
    const resto = src.slice(inicio);
    const cuerpo = resto.slice(0, resto.search(/\r?\n\}\r?\n/));
    expect(cuerpo.length).toBeGreaterThan(100);
    expect(cuerpo).not.toMatch(/UPDATE\s+debts|DELETE\s+FROM\s+debts|INSERT\s+INTO\s+debts/i);
  });
});
