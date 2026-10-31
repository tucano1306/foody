// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El cron de «se acaba el 0 %»: qué deuda notifica, que cada aviso salga una
 * sola vez y que un envío fallido se pueda reintentar. Las cifras y los
 * umbrales los prueba debt-promo.aviso.test.ts.
 */

type Llamada = { q: string; v: unknown[] };
let llamadas: Llamada[] = [];
let filas: Record<string, unknown>[] = [];
let yaMandado = false;

vi.mock('@/lib/db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    llamadas.push({ q, v });
    if (q.startsWith('SELECT d.id')) return filas;
    if (q.startsWith('INSERT INTO debt_promo_alerts')) return yaMandado ? [] : [{ debt_id: v[0] }];
    return [];
  }),
}));
vi.mock('@/lib/debt-data', () => ({ ensureDebtSchema: async () => {} }));
const rechazo = vi.fn((_req: Request): Response | null => null);
vi.mock('@/lib/cron-auth', () => ({ rechazoCron: (req: Request) => rechazo(req) }));
const sendWebPush = vi.fn();
vi.mock('@/lib/web-push', () => ({ sendWebPush: (...a: unknown[]) => sendWebPush(...a) }));

const { GET } = await import('./route');

const SUSCRIPCION = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } };
const fila = (promoEndsOn: string) => ({
  id: 'd1',
  user_id: 'u1',
  name: 'Adelanto  0 %',
  currency: 'USD',
  current_balance: '10000.00',
  promo_ends_on: promoEndsOn,
  rate_after_promo: '24.0000',
  push_subscription: SUSCRIPCION,
});

const correr = async () => (await GET(new NextRequest('http://localhost/api/cron/debt-promo-alerts'))).json();
const consultas = (prefijo: string) => llamadas.filter((l) => l.q.startsWith(prefijo));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-26T14:00:00Z')); // a 30 días del 25 ene 2027
  llamadas = [];
  filas = [fila('2027-01-25')];
  yaMandado = false;
  sendWebPush.mockReset().mockResolvedValue({ ok: true, gone: false });
  rechazo.mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/debt-promo-alerts', () => {
  it('a 30 días del fin: apunta el aviso y lo manda con lo que costará', async () => {
    expect(await correr()).toEqual({ revisadas: 1, enviados: 1 });
    expect(consultas('INSERT INTO debt_promo_alerts')[0].v).toEqual(['d1', '2027-01-25', '30']);
    expect(sendWebPush).toHaveBeenCalledWith(SUSCRIPCION, {
      title: '⏳ El 0 % de Adelanto 0 % se acaba en 30 días',
      body: 'Quedan $10,000.00. Si siguen ahí el 25 ene 2027, desde el día siguiente cobrará ~$200.00 al mes (24 %).',
      url: '/debts',
    });
  });

  it('un aviso ya mandado no se repite aunque el cron corra otra vez', async () => {
    yaMandado = true;
    expect(await correr()).toEqual({ revisadas: 1, enviados: 0 });
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('lejos del fin no se apunta ni se manda nada', async () => {
    filas = [fila('2027-06-30')];
    await correr();
    expect(consultas('INSERT INTO debt_promo_alerts')).toHaveLength(0);
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('si el envío falla se borra el apunte: mañana se reintenta', async () => {
    sendWebPush.mockResolvedValue({ ok: false, gone: false });
    expect(await correr()).toEqual({ revisadas: 1, enviados: 0 });
    expect(consultas('DELETE FROM debt_promo_alerts')[0].v).toEqual(['d1', '2027-01-25', '30']);
    expect(consultas('UPDATE users')).toHaveLength(0);
  });

  it('una suscripción que ya no existe se limpia', async () => {
    sendWebPush.mockResolvedValue({ ok: false, gone: true });
    await correr();
    expect(consultas('UPDATE users SET push_subscription = NULL')[0].v).toEqual([['u1']]);
  });

  it('la fecha que llega como Date también sirve', async () => {
    filas = [fila('x')].map((f) => ({ ...f, promo_ends_on: new Date('2027-01-25T00:00:00Z') }));
    await correr();
    expect(consultas('INSERT INTO debt_promo_alerts')[0].v[1]).toBe('2027-01-25');
  });

  it('sin permiso de cron no toca la base', async () => {
    rechazo.mockReturnValue(new Response(null, { status: 401 }));
    const res = await GET(new NextRequest('http://localhost/api/cron/debt-promo-alerts'));
    expect(res.status).toBe(401);
    expect(llamadas).toHaveLength(0);
  });
});
