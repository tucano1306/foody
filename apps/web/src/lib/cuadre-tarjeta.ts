/**
 * cuadre-tarjeta.ts — poner los saldos de Foody como dice el estado de cuenta.
 *
 * Los saldos de una tarjeta con tramos se desvían solos: un pago apuntado al
 * tramo equivocado, una tasa que el banco subió del 23.74 % al 23.99 %, un
 * adelanto que nunca se dio de alta. Ya pasó: Foody llevaba dos tramos y el
 * estado tenía tres, con cientos de dólares de diferencia en el de compras.
 * Repartir bien un abono sobre saldos mal puestos sigue dando un saldo mal
 * puesto.
 *
 * El estado de cuenta es la verdad: el usuario copia el saldo de cada tramo y
 * la app asienta en cada uno un AJUSTE por la diferencia —sin borrar nada del
 * historial—, guarda el mínimo y su vencimiento, y a partir de ahí el abono se
 * propone solo.
 *
 * Módulo PURO: sin SQL. Se prueba en cuadre-tarjeta.test.ts.
 */

const centavos = (n: number) => Math.round(n * 100) / 100;

export interface TramoEnFoody {
  readonly id: string;
  readonly balance: number;
}

export interface SaldoDelEstado {
  readonly debtId: string;
  readonly saldo: number;
}

/**
 * El ajuste que lleva cada tramo: lo que dice el estado menos lo que hay en
 * Foody. Positivo sube la deuda, negativo la baja. Se ignoran diferencias de
 * menos de un centavo y tramos que no son de la tarjeta.
 */
export function ajustesDeCuadre(
  enFoody: readonly TramoEnFoody[],
  delEstado: readonly SaldoDelEstado[],
): { debtId: string; ajuste: number }[] {
  const actual = new Map(enFoody.map((t) => [t.id, t.balance]));
  const out: { debtId: string; ajuste: number }[] = [];
  for (const e of delEstado) {
    const antes = actual.get(e.debtId);
    if (antes === undefined || !Number.isFinite(e.saldo) || e.saldo < 0) continue;
    const ajuste = centavos(e.saldo - antes);
    if (Math.abs(ajuste) >= 0.01) out.push({ debtId: e.debtId, ajuste });
  }
  return out;
}

export interface EstadoDelMinimo {
  readonly cubierto: boolean;
  /** Lo que falta para cubrir el mínimo; 0 si ya está. */
  readonly falta: number;
}

/** ¿Lo abonado desde el cierre cubre ya el mínimo del estado? */
export function estadoDelMinimo(
  info: { readonly minimumDue: number; readonly paidSinceClosing: number } | null | undefined,
): EstadoDelMinimo | null {
  if (!info || info.minimumDue <= 0) return null;
  const falta = centavos(Math.max(0, info.minimumDue - info.paidSinceClosing));
  return { cubierto: falta === 0, falta };
}

// ─── Lo que llega del formulario ──────────────────────────────────────────────

export interface CuadreValido {
  readonly closingDate: string;
  readonly minimumDue: number;
  readonly dueDate: string | null;
  readonly tramos: { debtId: string; balance: number; apr: number | null }[];
  readonly nuevos: { name: string; balance: number; apr: number; promoEndsOn: string | null }[];
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fechaValida(v: unknown): string | null {
  if (typeof v !== 'string' || !FECHA.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

function importe(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? centavos(n) : null;
}

function tasa(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10000) / 10000 : null;
}

/** Valida el cuerpo del cuadre. Devuelve el cuadre limpio o el porqué del rechazo. */
export function leerCuadre(body: unknown): CuadreValido | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  const closingDate = fechaValida(b.closingDate);
  if (!closingDate) return { error: 'Falta la fecha de cierre del estado de cuenta' };
  const minimumDue = importe(b.minimumDue);
  if (minimumDue === null) return { error: 'Falta el pago mínimo del estado de cuenta' };
  const dueDate = b.dueDate == null || b.dueDate === '' ? null : fechaValida(b.dueDate);
  if (b.dueDate != null && b.dueDate !== '' && !dueDate) return { error: 'La fecha de vencimiento no es válida' };

  const tramosIn = Array.isArray(b.tramos) ? b.tramos : [];
  const tramos: CuadreValido['tramos'] = [];
  for (const t of tramosIn.slice(0, 12)) {
    const o = (t ?? {}) as Record<string, unknown>;
    if (typeof o.debtId !== 'string' || !UUID.test(o.debtId)) return { error: 'Tramo desconocido' };
    const balance = importe(o.balance);
    if (balance === null) return { error: 'Cada saldo tiene que ser un número de 0 en adelante' };
    const apr = o.apr == null ? null : tasa(o.apr);
    if (o.apr != null && apr === null) return { error: 'La tasa tiene que estar entre 0 y 100 %' };
    tramos.push({ debtId: o.debtId, balance, apr });
  }

  const nuevosIn = Array.isArray(b.nuevos) ? b.nuevos : [];
  const nuevos: CuadreValido['nuevos'] = [];
  for (const n of nuevosIn.slice(0, 4)) {
    const o = (n ?? {}) as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 160) : '';
    if (!name) return { error: 'El saldo nuevo necesita un nombre' };
    const balance = importe(o.balance);
    if (balance === null || balance <= 0) return { error: 'El saldo nuevo tiene que ser mayor que 0' };
    const apr = tasa(o.apr);
    if (apr === null) return { error: 'La tasa del saldo nuevo tiene que estar entre 0 y 100 %' };
    const promoEndsOn = o.promoEndsOn == null || o.promoEndsOn === '' ? null : fechaValida(o.promoEndsOn);
    if (o.promoEndsOn != null && o.promoEndsOn !== '' && !promoEndsOn) return { error: 'La fecha de fin de la promoción no es válida' };
    nuevos.push({ name, balance, apr, promoEndsOn });
  }

  if (tramos.length === 0 && nuevos.length === 0) return { error: 'No hay saldos que cuadrar' };
  return { closingDate, minimumDue, dueDate, tramos, nuevos };
}
