// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firmarCuerpo } from './firma';

/**
 * El reconciliador contra una base de mentira (las tablas de computo_*, las
 * dos fuentes de gastos y los ingresos) y un Computo de mentira que comprueba
 * la firma.
 */

const DUENO = '11111111-1111-4111-8111-111111111111';
const SECRETO = 's'.repeat(40);
const CONFIG = { url: 'https://computo.test', secreto: SECRETO, duenoId: DUENO };

type Enlace = {
  activo: boolean;
  desde: string;
  empresa: string | null;
  empresa_negocio?: string | null;
  ingresos_desde?: string | null;
  ultima_sync: string | null;
  ultimo_error: string | null;
  ultimo_resumen: unknown;
  ocupado: boolean;
};
let enlace: Enlace | null = null;
let enviados: { ref: string; huella: string; remoto_id: string | null; vinculado: boolean }[] = [];
let tramos: Record<string, unknown>[] = [];
let pagos: Record<string, unknown>[] = [];
/** Filas de `finance_income_sources`, todas: los filtros que importan son los de JS. */
let ingresos: Record<string, unknown>[] = [];

vi.mock('../ensure-schema', () => ({
  ensureExpenseKindSchema: async () => undefined,
  ensureExpenseScopeSchema: async () => undefined,
  ensureTripSplitsSchema: async () => undefined,
}));
// `mapIncomeRow` es el de verdad: el día de un cheque tiene que ser el mismo
// aquí que en el Plan.
vi.mock('../finance-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finance-data')>()),
  ensureFinanceSchema: async () => undefined,
}));

vi.mock('../db', () => ({
  sql: vi.fn(async (partes: TemplateStringsArray, ...v: unknown[]) => {
    const q = partes.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('CREATE TABLE') || q.startsWith('ALTER TABLE')) return [];
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
        enlace.ocupado = false;
      }
      return [];
    }
    if (q.startsWith('UPDATE computo_enlace SET ingresos_desde = COALESCE')) {
      if (!enlace) return [];
      // Como el COALESCE de verdad: el primer valor que no sea NULL.
      const guardadaPrimero = q.startsWith('UPDATE computo_enlace SET ingresos_desde = COALESCE(ingresos_desde,');
      enlace.ingresos_desde = guardadaPrimero ? (enlace.ingresos_desde ?? String(v[0])) : String(v[0]);
      return [{ ingresos_desde: enlace.ingresos_desde }];
    }
    if (q.startsWith('UPDATE computo_enlace SET ingresos_desde')) {
      if (enlace) enlace.ingresos_desde = String(v[0]);
      return [];
    }
    if (q.startsWith('UPDATE computo_enlace SET empresa')) {
      if (enlace) Object.assign(enlace, { empresa: v[0], empresa_negocio: v[1] });
      return [];
    }
    if (q.includes('FROM trip_kind_amounts')) return tramos;
    if (q.includes('FROM payment_records')) return pagos;
    if (q.includes('FROM finance_income_sources')) return ingresos;
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

const { guardarEnlace, sincronizarComputo } = await import('./sync');

type Lote = { upserts: { ref: string }[]; borrar: { ref: string }[]; simular: boolean; ping?: boolean };
/** Un Computo de mentira: comprueba la firma y contesta lo que diga `responder`. */
let responder: (lote: Lote) => { status?: number; body: unknown };
const lotes: Lote[] = [];

/** Un cheque o pago suelto, como sale de la base. Importes inventados. */
const cheque = (id: string, dia: string, monto: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: 'Obra',
  amount: monto,
  frequency: 'one_time',
  is_active: true,
  note: null,
  business_share: '0',
  received_on: dia,
  created_at: `${dia}T15:00:00.000Z`,
  amount_as_of: null,
  ...extra,
});

/** Un Computo que ya acepta ingresos: su ping dice el día del último tecleado a mano. */
const conIngresos = (ultimoTecleado: string | null) => {
  const normal = responder;
  responder = (lote) =>
    lote.ping
      ? { body: { ok: true, empresa: { id: 'leo', nombre: 'Leonardo' }, empresaNegocio: null, ingresos: { ultimoTecleado } } }
      : normal(lote);
};

beforeEach(() => {
  enlace = { activo: true, desde: '2026-10-01', empresa: null, ultima_sync: null, ultimo_error: null, ultimo_resumen: null, ocupado: false };
  enviados = [];
  ingresos = [];
  lotes.length = 0;
  tramos = [{ trip_id: 'trip-1', kind: 'grocery', trip_kind: 'grocery', amount: '20.68', date: '2026-10-06T16:00:00.000Z', store_name: 'Publix' }];
  pagos = [{ id: 'rec-1', paid_at: '2026-10-05T15:00:00.000Z', monto: '93.39', month: 10, year: 2026, name: 'FPL', category: 'utilities' }];
  responder = (lote) => ({
    body: {
      ok: true,
      empresa: { id: 'leo', nombre: 'Leonardo' },
      empresaNegocio: { id: 'vene', nombre: 'Venecoro' },
      resultados: [
        ...(lote.upserts ?? []).map((u) => ({ ref: u.ref, accion: u.ref.startsWith('payment') ? 'vinculado' : 'creado', id: `cx-${u.ref}` })),
        ...(lote.borrar ?? []).map((b) => ({ ref: b.ref, accion: 'borrado' })),
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
    expect(enlace).toMatchObject({ empresa: 'Leonardo', empresa_negocio: 'Venecoro', ultimo_error: null, ocupado: false });
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
      { ref: 'trip:trip-1:grocery', modo: 'borrar', destino: 'personal' },
      { ref: 'payment:rec-1', modo: 'desvincular', destino: 'personal' },
    ]);
    expect(enviados).toEqual([]);
  });

  it('lo de negocio sale con su destino, y un gasto mixto se parte en dos', async () => {
    tramos = [];
    pagos = [
      { id: 'rec-gmc', paid_at: '2026-10-14T13:00:00.000Z', monto: '1097', month: 10, year: 2026, name: 'GMC', category: 'other', business_share: '100' },
      { id: 'rec-cel', paid_at: '2026-10-27T13:00:00.000Z', monto: '120.62', month: 10, year: 2026, name: 'Verizon', category: 'internet', business_share: '25' },
    ];
    await sincronizarComputo(DUENO, { config: CONFIG });
    const mandados = (lotes[0].upserts as unknown as { ref: string; monto: number; destino: string }[])
      .map((u) => [u.ref, u.monto, u.destino])
      .sort();
    expect(mandados).toEqual([
      ['payment:rec-cel', 90.46, 'personal'],
      ['payment:rec-cel:negocio', 30.16, 'negocio'],
      ['payment:rec-gmc:negocio', 1097, 'negocio'],
    ]);
  });

  it('lo que Computo omite se queda pendiente y se avisa', async () => {
    pagos = [{ id: 'rec-gmc', paid_at: '2026-10-14T13:00:00.000Z', monto: '1097', month: 10, year: 2026, name: 'GMC', category: 'other', business_share: '100' }];
    tramos = [];
    responder = (lote) => ({
      body: {
        ok: true,
        empresa: { id: 'leo', nombre: 'Leonardo' },
        empresaNegocio: null,
        resultados: lote.upserts.map((u) => ({ ref: u.ref, accion: 'omitido', motivo: 'Computo no tiene empresa de negocio configurada' })),
      },
    });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r).toEqual({
      estado: 'error',
      mensaje: '1 gasto de negocio no se mandó: Computo no tiene empresa de negocio configurada. Se reintentará solo.',
    });
    expect(enviados).toEqual([]);
    expect(enlace).toMatchObject({ ultimo_error: expect.stringContaining('no se mandó'), empresa_negocio: null });
    // La vuelta siguiente lo vuelve a intentar.
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes).toHaveLength(2);
  });

  it('sin nada que mandar, la primera vez pregunta a Computo: el ✓ no se da sin haber hablado con él', async () => {
    tramos = [];
    pagos = [];
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r.estado).toBe('al_dia');
    expect(lotes).toEqual([{ ping: true }]);
    expect(enlace).toMatchObject({ empresa: 'Leonardo', ultimo_error: null });
    // Ya se sabe dónde escribe: no se vuelve a preguntar.
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes).toHaveLength(1);
  });

  it('si esa pregunta falla, no hay ✓: se dice por qué', async () => {
    tramos = [];
    pagos = [];
    responder = () => ({ status: 401, body: { error: 'Firma invalida' } });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r).toEqual({ estado: 'error', mensaje: 'Computo rechazó la firma: el secreto no coincide entre las dos apps.' });
    expect(enlace?.ultimo_error).toMatch(/no coincide/);
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

  it('si las claves no coinciden, se dice cuál tiene cada app (huellas, no las claves)', async () => {
    responder = () => ({ status: 401, body: { error: 'Firma invalida', huella: 'abc123' } });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    // s × 40 es el secreto de prueba de este archivo.
    const mia = (await import('./firma')).huellaSecreto(SECRETO);
    expect(r).toEqual({
      estado: 'error',
      mensaje: `Las claves no coinciden: Foody usa la ·${mia} y Computo la ·abc123. Pon el mismo valor en COMPUTO_SECRET (Foody) y FOODY_SECRET (Computo) y vuelve a desplegar las dos apps.`,
    });
    expect(r.estado === 'error' && r.mensaje).not.toContain(SECRETO);
  });

  it('un 401 que no viene de Computo apunta a la dirección, no al secreto', async () => {
    responder = () => ({ status: 401, body: '<html>Vercel Authentication</html>' });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r.estado === 'error' && r.mensaje).toMatch(/COMPUTO_URL/);
  });

  it('una firma caducada habla de la hora', async () => {
    responder = () => ({ status: 401, body: { error: 'Firma caducada', huella: 'abc123' } });
    const r = await sincronizarComputo(DUENO, { config: CONFIG });
    expect(r.estado === 'error' && r.mensaje).toMatch(/relojes/);
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

describe('sincronizarComputo — ingresos', () => {
  it('los cheques entran desde el día SIGUIENTE al último ingreso tecleado a mano en Computo', async () => {
    // Lo cobrado hasta el 25 ya lo tecleó el usuario (quizá sumado en uno):
    // mandarlo lo contaría dos veces.
    ingresos = [cheque('c1', '2026-10-16', '500'), cheque('c2', '2026-10-24', '700'), cheque('c3', '2026-10-31', '1200.5')];
    conIngresos('2026-10-25');

    const r = await sincronizarComputo(DUENO, { config: CONFIG });

    expect(r.estado).toBe('enviado');
    expect(lotes[0]).toEqual({ ping: true });
    expect(enlace?.ingresos_desde).toBe('2026-10-26');
    expect(lotes[1].upserts.map((u) => u.ref).sort()).toEqual(['income:c3', 'payment:rec-1', 'trip:trip-1:grocery']);
    expect(lotes[1].upserts.find((u) => u.ref === 'income:c3')).toEqual({
      ref: 'income:c3',
      fecha: '2026-10-31',
      monto: 1200.5,
      categoria: 'Otros Ingresos',
      descripcion: 'Obra',
      notas: 'Desde Foody · Ingresos',
      destino: 'personal',
    });
    expect(enviados.map((e) => e.ref)).toContain('income:c3');

    // Con la fecha ya guardada no se vuelve a preguntar, y sin cambios no se
    // habla con Computo.
    expect((await sincronizarComputo(DUENO, { config: CONFIG })).estado).toBe('al_dia');
    expect(lotes).toHaveLength(2);
  });

  it('solo van los cheques y pagos sueltos encendidos: ni sueldos, ni acumulados, ni lo apagado, ni la parte de negocio', async () => {
    enlace!.ingresos_desde = '2026-10-01';
    ingresos = [
      cheque('suelto', '2026-10-10', '300'),
      cheque('sueldo', '2026-10-10', '2000', { frequency: 'monthly' }),
      cheque('quincena', '2026-10-10', '900', { frequency: 'biweekly' }),
      cheque('acumulado', '2026-10-10', '25000', { frequency: 'ytd' }),
      cheque('apagado', '2026-10-10', '80', { is_active: false }),
      cheque('mixto', '2026-10-12', '1000', { business_share: '40' }),
      cheque('negocio', '2026-10-12', '1500', { business_share: '100' }),
      cheque('antes', '2026-09-30', '60'),
    ];
    await sincronizarComputo(DUENO, { config: CONFIG });

    const mandados = (lotes[0].upserts as unknown as { ref: string; monto: number }[])
      .filter((u) => u.ref.startsWith('income:'))
      .map((u) => [u.ref, u.monto])
      .sort();
    expect(mandados).toEqual([
      ['income:mixto', 600],
      ['income:suelto', 300],
    ]);
  });

  it('un Computo que todavía no sabe de ingresos: no se fija fecha ni se manda ninguno, y los gastos sí van', async () => {
    ingresos = [cheque('c3', '2026-10-31', '1200.5')];
    // El `responder` de siempre: su ping no dice nada de ingresos.
    const r = await sincronizarComputo(DUENO, { config: CONFIG });

    expect(r.estado).toBe('enviado');
    expect(lotes[0]).toEqual({ ping: true });
    expect(lotes[1].upserts.map((u) => u.ref).sort()).toEqual(['payment:rec-1', 'trip:trip-1:grocery']);
    expect(enlace?.ingresos_desde ?? null).toBeNull();
    // Se vuelve a preguntar en la siguiente vuelta: el día que Computo los
    // acepte, empiezan solos.
    conIngresos(null);
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes[2]).toEqual({ ping: true });
    expect(enlace?.ingresos_desde).toBe('2026-10-01');
    expect(lotes[3].upserts.map((u) => u.ref)).toEqual(['income:c3']);
  });

  it('sin cobros desde el día de los gastos no se pregunta nada ni se fija fecha', async () => {
    enlace!.empresa = 'Leonardo';
    ingresos = [cheque('viejo', '2026-09-20', '400')];
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes.some((l) => l.ping)).toBe(false);
    expect(enlace?.ingresos_desde ?? null).toBeNull();
  });

  it('con la fecha ya fijada, lo tecleado después en Computo no la mueve', async () => {
    enlace!.ingresos_desde = '2026-10-20';
    ingresos = [cheque('c2', '2026-10-24', '700'), cheque('c3', '2026-10-31', '1200.5')];
    conIngresos('2026-11-15');
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes.some((l) => l.ping)).toBe(false);
    expect(lotes[0].upserts.map((u) => u.ref).filter((ref) => ref.startsWith('income:')).sort()).toEqual(['income:c2', 'income:c3']);
    expect(enlace?.ingresos_desde).toBe('2026-10-20');
  });

  it('con una fecha puesta en la hoja no se pregunta a Computo', async () => {
    await guardarEnlace(DUENO, { ingresosDesde: '2026-10-28' });
    ingresos = [cheque('c3', '2026-10-31', '1200.5')];
    conIngresos('2026-10-29');
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(enlace?.ingresos_desde).toBe('2026-10-28');
    expect(lotes.some((l) => l.ping)).toBe(false);
    expect(lotes[0].upserts.map((u) => u.ref)).toContain('income:c3');
  });

  it('si la hoja pone una fecha mientras se pregunta a Computo, gana la de la hoja', async () => {
    ingresos = [cheque('c2', '2026-10-29', '700'), cheque('c3', '2026-10-31', '1200.5')];
    conIngresos('2026-10-29');
    const computo = responder;
    responder = (lote) => {
      // El usuario mueve la fecha justo mientras Foody le pregunta a Computo.
      if (lote.ping) enlace!.ingresos_desde = '2026-10-28';
      return computo(lote);
    };
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(enlace?.ingresos_desde).toBe('2026-10-28');
    expect(lotes[1].upserts.map((u) => u.ref).filter((ref) => ref.startsWith('income:')).sort()).toEqual(['income:c2', 'income:c3']);
  });

  it('un cheque apagado o borrado sale de Computo: lo creado se borra, lo enlazado se suelta', async () => {
    enlace!.ingresos_desde = '2026-10-01';
    tramos = [];
    pagos = [];
    ingresos = [cheque('creado', '2026-10-10', '300'), cheque('tecleado', '2026-10-11', '450')];
    responder = (lote) => ({
      body: {
        ok: true,
        empresa: { id: 'leo', nombre: 'Leonardo' },
        empresaNegocio: null,
        resultados: [
          ...(lote.upserts ?? []).map((u) => ({ ref: u.ref, accion: u.ref === 'income:tecleado' ? 'vinculado' : 'creado' })),
          ...(lote.borrar ?? []).map((b) => ({ ref: b.ref, accion: 'borrado' })),
        ],
      },
    });
    await sincronizarComputo(DUENO, { config: CONFIG });

    ingresos = [cheque('creado', '2026-10-10', '300', { is_active: false })];
    await sincronizarComputo(DUENO, { config: CONFIG });
    expect(lotes[1].borrar).toEqual([
      { ref: 'income:creado', modo: 'borrar', destino: 'personal' },
      { ref: 'income:tecleado', modo: 'desvincular', destino: 'personal' },
    ]);
    expect(enviados).toEqual([]);
  });

  it('la vista previa no fija la fecha de los ingresos: simular no escribe', async () => {
    ingresos = [cheque('c3', '2026-10-31', '1200.5')];
    conIngresos('2026-10-25');
    await sincronizarComputo(DUENO, { config: CONFIG, simular: true });
    expect(lotes.some((l) => l.ping)).toBe(false);
    expect(lotes[0].upserts.map((u) => u.ref)).not.toContain('income:c3');
    expect(enlace?.ingresos_desde ?? null).toBeNull();

    // Con la fecha ya puesta, la vista previa sí los enseña.
    enlace!.ingresos_desde = '2026-10-26';
    await sincronizarComputo(DUENO, { config: CONFIG, simular: true });
    expect(lotes[1].upserts.map((u) => u.ref)).toContain('income:c3');
    expect(enviados).toEqual([]);
  });
});
