/**
 * sync.ts — llevar los gastos de Foody a Computo.
 *
 * Tres tablas pequeñas, solo del dueño (ver config.ts):
 *
 *   computo_enlace    encendido o no, desde qué día, y cómo fue la última vez
 *   computo_enviados  lo que ya está en Computo: ref + huella (+ si solo se
 *                     enlazó a un gasto que el usuario ya tenía tecleado)
 *
 * `sincronizarComputo` calcula el estado deseado (tickets y pagos desde la
 * fecha elegida), lo compara con lo enviado (plan.ts) y manda la diferencia en
 * lotes firmados. Es idempotente: si se corta a mitad, la siguiente vuelta
 * termina el trabajo sin duplicar nada, porque Computo identifica cada gasto
 * por su ref.
 */
import { sql } from '../db';
import { ensureExpenseKindSchema, ensureTripSplitsSchema } from '../ensure-schema';
import { aCampoDeFecha } from '../app-time';
import { configComputo, type ConfigComputo } from './config';
import {
  enviarLote,
  ErrorComputo,
  pingComputo,
  type AccionComputo,
  type EmpresasComputo,
  type ResultadoComputo,
} from './cliente';
import { gastosDePago, gastosDeTicket, huella, type GastoComputo } from './mapeo';
import { planificar, planVacio, type Borrado, type Enviado, type PlanComputo } from './plan';

/** Una fecha de la base como ISO. Neon devuelve `Date` o texto según el tipo de columna. */
function asIsoString(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString();
  const d = new Date(String(valor ?? ''));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Lo que cabe en un lote de Computo. */
const POR_LOTE = 150;

let esquemaListo: Promise<void> | null = null;

export function ensureComputoSchema(): Promise<void> {
  esquemaListo ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS computo_enlace (
        user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        activo         BOOLEAN NOT NULL DEFAULT false,
        desde          DATE NOT NULL,
        empresa        TEXT,
        ultima_sync    TIMESTAMPTZ,
        ultimo_error   TEXT,
        ultimo_resumen JSONB,
        ocupado_hasta  TIMESTAMPTZ,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS computo_enviados (
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ref        TEXT NOT NULL,
        huella     TEXT NOT NULL,
        remoto_id  TEXT,
        vinculado  BOOLEAN NOT NULL DEFAULT false,
        enviado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, ref)
      )
    `;
    // La empresa de negocio llegó después: lo de negocio va a otra empresa.
    await sql`ALTER TABLE computo_enlace ADD COLUMN IF NOT EXISTS empresa_negocio TEXT`;
  })().catch((e) => {
    esquemaListo = null;
    throw e;
  });
  return esquemaListo;
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export interface Enlace {
  readonly activo: boolean;
  /** YYYY-MM-DD. */
  readonly desde: string;
  readonly empresa: string | null;
  /** La empresa de Computo donde entra lo de negocio, si Computo tiene una. */
  readonly empresaNegocio: string | null;
  readonly ultimaSync: string | null;
  readonly ultimoError: string | null;
  readonly ultimoResumen: ResumenSync | null;
}

export interface ResumenSync {
  readonly porAccion: Partial<Record<AccionComputo, number>>;
  readonly enviados: number;
}

function aClave(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor ?? '').slice(0, 10);
}

export async function leerEnlace(userId: string): Promise<Enlace | null> {
  await ensureComputoSchema();
  const rows = await sql`SELECT * FROM computo_enlace WHERE user_id = ${userId} LIMIT 1`;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    activo: r.activo === true,
    desde: aClave(r.desde),
    empresa: (r.empresa as string | null) ?? null,
    empresaNegocio: (r.empresa_negocio as string | null) ?? null,
    ultimaSync: r.ultima_sync ? asIsoString(r.ultima_sync) : null,
    ultimoError: (r.ultimo_error as string | null) ?? null,
    ultimoResumen: (r.ultimo_resumen as ResumenSync | null) ?? null,
  };
}

/**
 * Hoy en Miami, YYYY-MM-DD: el día desde el que empieza a contar un enlace nuevo.
 *
 * El milisegundo de más evita que un «ahora» que caiga justo a medianoche UTC
 * se lea como fecha sin hora (ver `esSoloFecha` en app-time.ts).
 */
export function hoyClave(ahora: Date = new Date()): string {
  const t = ahora.getTime();
  return aCampoDeFecha(new Date(t % 86_400_000 === 0 ? t + 1 : t).toISOString());
}

export async function guardarEnlace(userId: string, cambios: { activo?: boolean; desde?: string }): Promise<Enlace> {
  await ensureComputoSchema();
  const desde = cambios.desde ?? hoyClave();
  await sql`
    INSERT INTO computo_enlace (user_id, activo, desde)
    VALUES (${userId}, ${cambios.activo ?? false}, ${desde}::date)
    ON CONFLICT (user_id) DO UPDATE SET
      activo = COALESCE(${cambios.activo ?? null}::boolean, computo_enlace.activo),
      desde = COALESCE(${cambios.desde ?? null}::date, computo_enlace.desde),
      updated_at = now()
  `;
  return (await leerEnlace(userId)) as Enlace;
}

/** Lo que DEBERÍA estar en Computo: tickets y pagos del usuario desde `desde`. */
export async function cargarDeseados(userId: string, desde: string): Promise<GastoComputo[]> {
  await ensureExpenseKindSchema();
  await ensureTripSplitsSchema();
  // Dos días de margen en SQL y el corte exacto en JS: la fecha que cuenta es
  // el día en Miami, y en UTC una compra de la noche cae al día siguiente.
  const [tramos, pagos] = await Promise.all([
    sql`
      SELECT trip_id, kind, trip_kind, amount, date, store_name, business_share
        FROM trip_kind_amounts
       WHERE user_id = ${userId} AND amount > 0
         AND date >= ${desde}::date - INTERVAL '2 days'
    `,
    sql`
      SELECT r.id, r.paid_at, COALESCE(r.actual_amount, r.amount) AS monto, r.month, r.year,
             p.name, p.category, p.business_share
        FROM payment_records r
        JOIN monthly_payments p ON p.id = r.payment_id
       WHERE r.user_id = ${userId} AND r.status = 'paid' AND r.paid_at IS NOT NULL
         AND COALESCE(r.actual_amount, r.amount) > 0
         AND r.paid_at >= ${desde}::date - INTERVAL '2 days'
    `,
  ]);

  const gastos: GastoComputo[] = [
    ...(tramos as Record<string, unknown>[]).flatMap((t) =>
      gastosDeTicket({
        tripId: String(t.trip_id),
        kind: String(t.kind ?? ''),
        tripKind: String(t.trip_kind ?? t.kind ?? ''),
        amount: Number(t.amount),
        date: asIsoString(t.date),
        storeName: (t.store_name as string | null) ?? null,
        businessShare: Number(t.business_share ?? 0),
      }),
    ),
    ...(pagos as Record<string, unknown>[]).flatMap((p) =>
      gastosDePago({
        recordId: String(p.id),
        paidAt: asIsoString(p.paid_at),
        monto: Number(p.monto),
        nombre: String(p.name ?? ''),
        category: (p.category as string | null) ?? null,
        month: Number(p.month),
        year: Number(p.year),
        businessShare: Number(p.business_share ?? 0),
      }),
    ),
  ];
  return gastos.filter((g) => g.fecha >= desde && g.monto > 0);
}

async function cargarEnviados(userId: string): Promise<Enviado[]> {
  const rows = await sql`SELECT ref, huella, vinculado FROM computo_enviados WHERE user_id = ${userId}`;
  return (rows as Record<string, unknown>[]).map((r) => ({
    ref: String(r.ref),
    huella: String(r.huella),
    vinculado: r.vinculado === true,
  }));
}

// ─── Sincronizar ──────────────────────────────────────────────────────────────

export type ResultadoSync =
  | { estado: 'no_disponible' | 'inactivo' | 'ocupado' }
  | { estado: 'al_dia'; resumen: ResumenSync }
  | { estado: 'enviado'; resumen: ResumenSync }
  | { estado: 'simulado'; resultados: readonly (ResultadoComputo & { gasto?: GastoComputo })[]; borrar: readonly Borrado[] }
  | { estado: 'error'; mensaje: string };

/**
 * Un solo turno por usuario: dos `after()` seguidos (guardar un ticket y
 * repartirlo) no deben mandar dos veces el mismo lote. Con Neon por HTTP no hay
 * cerrojos de sesión, así que es un «ocupado hasta» con caducidad: si un
 * turno muere a mitad, a los dos minutos se puede volver a intentar.
 */
async function tomarTurno(userId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE computo_enlace SET ocupado_hasta = now() + INTERVAL '2 minutes'
     WHERE user_id = ${userId} AND (ocupado_hasta IS NULL OR ocupado_hasta < now())
    RETURNING user_id
  `;
  return rows.length > 0;
}

async function registrar(userId: string, cambios: { error: string | null; resumen?: ResumenSync }): Promise<void> {
  await sql`
    UPDATE computo_enlace SET
      ultima_sync = now(),
      ultimo_error = ${cambios.error},
      ultimo_resumen = COALESCE(${cambios.resumen ? JSON.stringify(cambios.resumen) : null}::jsonb, ultimo_resumen),
      ocupado_hasta = NULL,
      updated_at = now()
    WHERE user_id = ${userId}
  `;
}

async function guardarResultados(
  userId: string,
  plan: PlanComputo,
  resultados: readonly ResultadoComputo[],
): Promise<void> {
  const porRef = new Map(plan.upserts.map((g) => [g.ref, g]));
  for (const r of resultados) {
    const gasto = porRef.get(r.ref);
    if (gasto && ['creado', 'actualizado', 'sin_cambios', 'vinculado'].includes(r.accion)) {
      await sql`
        INSERT INTO computo_enviados (user_id, ref, huella, remoto_id, vinculado)
        VALUES (${userId}, ${r.ref}, ${huella(gasto)}, ${r.id ?? null}, ${r.accion === 'vinculado'})
        ON CONFLICT (user_id, ref) DO UPDATE SET
          huella = EXCLUDED.huella,
          remoto_id = COALESCE(EXCLUDED.remoto_id, computo_enviados.remoto_id),
          vinculado = computo_enviados.vinculado OR EXCLUDED.vinculado,
          enviado_at = now()
      `;
    } else if (['borrado', 'desvinculado', 'no_existe'].includes(r.accion)) {
      await sql`DELETE FROM computo_enviados WHERE user_id = ${userId} AND ref = ${r.ref}`;
    }
  }
}

/** En qué empresas escribe Computo: lo que enseña la hoja, y la prueba de que el secreto coincide. */
async function guardarEmpresas(userId: string, e: EmpresasComputo): Promise<void> {
  await sql`
    UPDATE computo_enlace SET
      empresa = ${e.empresa?.nombre ?? null},
      empresa_negocio = ${e.empresaNegocio?.nombre ?? null},
      updated_at = now()
    WHERE user_id = ${userId}
  `;
}

function sumar(a: Partial<Record<AccionComputo, number>>, resultados: readonly ResultadoComputo[]) {
  for (const r of resultados) a[r.accion] = (a[r.accion] ?? 0) + 1;
  return a;
}

export async function calcularPlan(userId: string, desde: string): Promise<PlanComputo> {
  const [deseados, enviados] = await Promise.all([cargarDeseados(userId, desde), cargarEnviados(userId)]);
  return planificar(deseados, enviados);
}

/**
 * Lleva a Computo lo que falte. Con `simular`, pregunta qué pasaría (crear,
 * enlazar a un gasto tecleado, actualizar…) sin escribir nada en ninguno de
 * los dos lados: es la vista previa de la hoja antes de encenderlo.
 */
export async function sincronizarComputo(
  userId: string,
  opciones: { simular?: boolean; desde?: string; config?: ConfigComputo | null } = {},
): Promise<ResultadoSync> {
  const config = opciones.config === undefined ? configComputo() : opciones.config;
  if (!config || userId !== config.duenoId) return { estado: 'no_disponible' };

  const enlace = await leerEnlace(userId);
  const simular = opciones.simular === true;
  if (!simular && !enlace?.activo) return { estado: 'inactivo' };
  const desde = opciones.desde ?? enlace?.desde ?? hoyClave();

  if (simular) {
    try {
      const plan = await calcularPlan(userId, desde);
      if (planVacio(plan)) return { estado: 'simulado', resultados: [], borrar: [] };
      const porRef = new Map(plan.upserts.map((g) => [g.ref, g]));
      const respuesta = await enviarLote(config, { upserts: plan.upserts.slice(0, POR_LOTE), borrar: plan.borrar.slice(0, POR_LOTE), simular: true });
      return {
        estado: 'simulado',
        resultados: respuesta.resultados.map((r) => ({ ...r, gasto: porRef.get(r.ref) })),
        borrar: plan.borrar,
      };
    } catch (e) {
      return { estado: 'error', mensaje: e instanceof ErrorComputo ? e.message : 'No se pudo preparar la vista previa.' };
    }
  }

  if (!(await tomarTurno(userId))) return { estado: 'ocupado' };

  try {
    const plan = await calcularPlan(userId, desde);
    if (planVacio(plan)) {
      // Sin nada que mandar no se habla con Computo, y entonces nada demostraba
      // que el secreto coincide: la hoja enseñaba «✓ al día» sin haberle
      // preguntado. Mientras no se sepa en qué empresa escribe, se le pregunta.
      if (!enlace?.empresa) await guardarEmpresas(userId, await pingComputo(config));
      const resumen: ResumenSync = { porAccion: {}, enviados: 0 };
      await registrar(userId, { error: null, resumen });
      return { estado: 'al_dia', resumen };
    }

    const porAccion: Partial<Record<AccionComputo, number>> = {};
    let empresas: EmpresasComputo | undefined;
    const omitidos: ResultadoComputo[] = [];
    // Primero los borrados (en su propio lote si hace falta) y luego los
    // nuevos: un ticket reclasificado suelta su ref vieja antes de crear la
    // nueva.
    for (let i = 0; i < Math.max(plan.upserts.length, plan.borrar.length); i += POR_LOTE) {
      const lote = {
        upserts: plan.upserts.slice(i, i + POR_LOTE),
        borrar: plan.borrar.slice(i, i + POR_LOTE),
      };
      const respuesta = await enviarLote(config, { ...lote, simular: false });
      empresas = respuesta;
      omitidos.push(...respuesta.resultados.filter((r) => r.accion === 'omitido'));
      await guardarResultados(userId, { upserts: lote.upserts, borrar: lote.borrar }, respuesta.resultados);
      sumar(porAccion, respuesta.resultados);
    }

    const resumen: ResumenSync = { porAccion, enviados: plan.upserts.length + plan.borrar.length };
    if (empresas) await guardarEmpresas(userId, empresas);
    // Lo omitido se queda pendiente (no entra en computo_enviados) y se
    // reintenta solo; pero el usuario tiene que saber que falta algo.
    const error = omitidos.length > 0 ? mensajeDeOmitidos(omitidos) : null;
    await registrar(userId, { error, resumen });
    return error ? { estado: 'error', mensaje: error } : { estado: 'enviado', resumen };
  } catch (e) {
    const mensaje = e instanceof ErrorComputo ? e.message : 'Algo falló al sincronizar. Se reintentará solo.';
    console.error('[computo] sincronizar:', e);
    await registrar(userId, { error: mensaje }).catch(() => undefined);
    return { estado: 'error', mensaje };
  }
}

function mensajeDeOmitidos(omitidos: readonly ResultadoComputo[]): string {
  const cuantos = omitidos.length === 1 ? '1 gasto de negocio no se mandó' : `${omitidos.length} gastos de negocio no se mandaron`;
  return `${cuantos}: ${omitidos[0].motivo ?? 'Computo no lo apuntó'}. Se reintentará solo.`;
}

/** Comprueba la conexión y recuerda en qué empresas escribe Computo. */
export async function probarConexion(userId: string, config: ConfigComputo | null = configComputo()) {
  if (!config || userId !== config.duenoId) return { ok: false as const, mensaje: 'No disponible' };
  try {
    const empresas = await pingComputo(config);
    await ensureComputoSchema();
    await guardarEmpresas(userId, empresas);
    return { ok: true as const, ...empresas };
  } catch (e) {
    return { ok: false as const, mensaje: e instanceof ErrorComputo ? e.message : 'No se pudo conectar con Computo.' };
  }
}
