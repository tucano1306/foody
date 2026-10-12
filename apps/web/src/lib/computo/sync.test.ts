// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firmarCuerpo } from './firma';

/**
 * El reconciliador contra una base de mentira (las tablas de computo_* y las
 * dos fuentes de gastos) y un Computo de mentira que comprueba la firma.
 */

const DUENO = '11111111-1111-4111-8111-111111111111';
const SECRETO = 's'.repeat(40);
const CONFIG = { url: 'https://computo.test', secreto: SECRETO, duenoId: DUENO };

type Enlace = {
  activo: boolean;
  desde: string;
  empresa: string | null;
  ultima_sync: string | null;
  ultimo_error: string | null;
  ultimo_resumen: unknown;
  ocupado: boolean;
};
let enlace: Enlace | null = null;
let enviados: { ref: string; huella: string; remoto_id: string | null; vinculado: boolean }[] = [];
let tramos: Record<string, unknown>[] = [];
let pagos: Record<string, unknown>[] = [];

vi.mock('../ensure-schema', () => ({
  ensureExpenseKindSchema: async () => undefined,
  ensureTripSplitsSchema: async () => undefined,
}));

vi.mock('../db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('CREATE TABLE')) return [];
    if (q.startsWith('SELECT * FROM computo_enlace')) return enlace ? [enlace] : [];
    if (q.startsWith('INSERT INTO computo_enlace')) {
      enlace ??= { activo: false, desde: String(v[2]), empresa: null, ultima_sync: null, ultimo_error: null, ultimo_resumen: null, ocupado: false };
      if (v[3] !== null) enlace.activo = v[3] as boolean;
      if (v[4] !== null) enlace.desde = String(v[4]);
      return [];
    }
    if (q.startsWith('UPDATE computo_enlace SET ocupado_hasta')) {
      if (!enlace || enlace.ocupado) return [];
      enlace.ocupado = true;
      return [{ user_id: DUENO }];
    }
    if (q.startsWith('UPDATE computo_enlace SET ultima_sync')) {
      if (enlace) {
        enlace.ultima_sync = new Date().toISOString();
        enlace.ultimo_error = v[0] as string | null;
        if (v[1]) enlace.ultimo_resumen = JSON.parse(String(v[1]));
        if (v[2]) enlace.empresa = String(v[2]);
        enlace.ocupado = false;
      }
      return [];
    }
    if (q.includes('FROM trip_kind_amounts')) return tramos;
    if (q.includes('FROM payment_records')) return pagos;
    if (q.startsWith('SELECT ref, huella, vinculado FROM computo_enviados')) return enviados;
    if (q.startsWith('INSERT INTO computo_enviados')) {
      const [, ref, huella, remoto, vinculado] = v as [string, string, string, string | null, boolean];
      const previo = enviados.find((e) => e.ref === ref);
      if (previo) Object.assign(previo, { huella, remoto_id: remoto ?? previo.remoto_id, vinculado: previo.vinculado || vinculado });
      else enviados.push({ ref, huella, remoto_id: remoto, vinculado });
      return [];
    }
    if (q.startsWith('DELETE FROM computo_enviados')) {
      enviados = enviados.filter((e) => e.ref !== v[1]);
      return [];
    }
    throw new Error(`consulta no simulada: ${q}`);
  }),
}));

const { sincronizarComputo } = await import('./sync');

/** Un Computo de mentira: comprueba la firma y contesta lo que diga `responder`. */
let responder: (lote: { upserts: { ref: string }[]; borrar: { ref: string }[]; simular: boolean }) => { status?: number; body: unknown };
const lotes: { upserts: { ref: string }[]; borrar: { ref: string }[]; simular: boolean }[] = [];

beforeEach(() => {
  enlace = { activo: true, desde: '2026-10-01', empresa: null, ultima_sync: null, ultimo_error: null, ultimo_resumen: null, ocupado: false };
  enviados = [];
  lotes.length = 0;
  tramos = [{ trip_id: 'trip-1', kind: 'grocery', trip_kind: 'grocery', amount: '20.68', date: '2026-10-06T16:00:00.000Z', store_name: 'Publix' }];
  pagos = [{ id: 'rec-1', paid_at: '2026-10-05T15:00:00.000Z', monto: '93.39', month: 10, year: 2026, name: 'FPL', category: 'utilities' }];
  responder = (lote) => ({
    body: {
      ok: true,
      empresa: { id: 'leo', nombre: 'Leonardo' },
      resultados: [
        ...lote.upserts.map((u) => ({ ref: u.ref, accion: u.ref.startsWith('payment') ? 'vinculado' : 'creado', id: `cx-${u.ref}` })),
        ...lote.borrar.map((b) => ({ ref: b.ref, accion: 'borrado' })),
      ],
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://computo.test/api/integrations/foody');
      const cuerpo = String(init.body);
      const firma = (init.headers as Record<string, string>)['x-foody-signature'];
      const t = Number(firma.match(/t=(\d+)/)?.[1]);
      expect(firma).toBe(`t=${t},v1=${firmarCuerpo(SECRETO, t, cuerpo)}`);
      const lote = JSON.parse(cuerpo);
      lotes.push(lote);
      const r = responder(lote);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('sincronizarComputo', () => {
  it('para otro usuario no existe', async () => {
    expect(await sincronizarComputo('otro', { config: CONFIG })).toEqual({ estado: 'no_disponible' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('apagado, no manda nada', async () => {
    enlace!.activo = false;
    expect(await sincronizarComputo(DUENO, { config: CONFIG })).toEqual({ estado: 'inactivo' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('manda lo nuevo firmado, y recuerda qué se creó y qué se enlazó', async () => {
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r).toEqual({ estado: 'enviado', resumen: { porAccion: { creado: 1, vinculado: 1 }, enviados: 2 } });
    expect(lotes[0].upserts.map((u) => u.ref).sort()).toEqual(['payment:rec-1', 'trip:trip-1:grocery']);
    expect(lotes[0].simular).toBe(false);
    expect(enviados.find((e) => e.ref === 'payment:rec-1')).toMatchObject({ vinculado: true, remoto_id: 'cx-payment:rec-1' });
    expect(enviados.find((e) => e.ref === 'trip:trip-1:grocery')).toMatchObject({ vinculado: false });
    expect(enlace).toMatchObject({ empresa: 'Leonardo', ultimo_error: null, ocupado: false });
  });

  it('la segunda vuelta sin cambios no llama a Computo', async () => {
    await sincronizarComputo(DUENO, { config: CONFIG });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r.estado).toBe('al_dia');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('lo borrado en Foody: lo creado se borra, lo enlazado se desvincula', async () => {
    await sincronizarComputo(DUENO, { config: CONFIG });
    tramos = [];
    pagos = [];
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes[1].borrar).toEqual([
      { ref: 'trip:trip-1:grocery', modo: 'borrar' },
      { ref: 'payment:rec-1', modo: 'desvincular' },
    ]);
    expect(enviados).toEqual([]);
  });

  it('cuenta desde el día elegido, en hora de Miami', async () => {
    enlace!.desde = '2026-10-06';
    // 02:00 UTC del 6 = 22:00 del 5 en Miami: queda fuera.
    tramos.push({ trip_id: 'trip-0', kind: 'fuel', trip_kind: 'fuel', amount: '40', date: '2026-10-06T02:00:00.000Z', store_name: 'Mobil' });
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes[0].upserts.map((u) => u.ref)).toEqual(['trip:trip-1:grocery']);
  });

  it('si Computo rechaza la firma, se dice por qué y nada se da por enviado', async () => {
    responder = () => ({ status: 401, body: { error: 'Firma invalida' } });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r).toEqual({ estado: 'error', mensaje: 'Computo rechazó la firma: el secreto no coincide entre las dos apps.' });
    expect(enviados).toEqual([]);
    expect(enlace).toMatchObject({ ultimo_error: r.estado === 'error' ? r.mensaje : null, ocupado: false });
  });

  it('con otra vuelta en marcha, no se pisan', async () => {
    enlace!.ocupado = true;
    expect(await sincronizarComputo(DUENO, { config: CONFIG })).toEqual({ estado: 'ocupado' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('simular pregunta a Computo sin escribir nada en ningún lado, aunque esté apagado', async () => {
    enlace!.activo = false;
    const r = await sincronizarComputo(DUENO, { config: CONFIG, simular: true });
    expect(lotes[0].simular).toBe(true);
    expect(r.estado).toBe('simulado');
    if (r.estado === 'simulado') {
      expect(r.resultados.find((x) => x.ref === 'payment:rec-1')).toMatchObject({ accion: 'vinculado', gasto: { descripcion: 'FPL' } });
    }
    expect(enviados).toEqual([]);
  });
});
