/**
 * deuda-a-meta.ts — pasar una deuda a las Metas del Plan, de un toque.
 *
 * Antes, perseguir una tarjeta desde el Plan era copiar a mano lo que Deudas
 * ya sabía: el nombre, cuánto se debe, cuánto se lleva pagado y para cuándo.
 * Cinco campos tecleados sobre datos que la app tenía, y en cuanto se
 * equivocaba uno la meta y la deuda contaban historias distintas (ver
 * `goalWithDebt` en finance-engine.ts, que nació justo de eso).
 *
 * Aquí la deuda propone su propia meta. Las cifras salen de `goalWithDebt`, la
 * MISMA función con la que el Plan leerá la meta después, así que lo que se ve
 * al crearla es exactamente lo que se verá en Metas. La meta queda enganchada
 * (`debtId`): abonar en Deudas la mueve sola.
 *
 * Lógica pura —sin SQL ni React— para que el servidor la use al crear y la
 * pantalla la use para la vista previa, y las dos digan lo mismo.
 */
import { promoVigente, type DebtKind, type DebtStatus } from './debt-engine';
import { goalWithDebt, type FinanceGoal } from './finance-engine';
import type { TipoDePromo } from './condiciones-credito';

/** Por debajo de un centavo, una deuda está pagada (redondeos del devengo). */
const POLVO = 0.005;

/** El largo máximo del nombre de una meta (VARCHAR(160) en finance_goals). */
const NOMBRE_MAX = 160;

/**
 * El emoji de la meta según el tipo de deuda: el mismo que lleva la deuda en
 * su pantalla, para reconocerla de un vistazo en el Plan. Vive aquí y no se
 * importa de `debt-ui.ts` porque `lib/` no depende de componentes; una prueba
 * comprueba que los dos mapas no se separen.
 */
export const EMOJI_DE_DEUDA: Readonly<Record<DebtKind, string>> = {
  credit_card: '💳',
  loan: '🏦',
  personal: '🤝',
  mortgage: '🏠',
  auto: '🚗',
  store: '🛍️',
  other: '📄',
};

/** Lo que hace falta saber de una deuda para proponer su meta. */
export interface DeudaParaMeta {
  id: string;
  name: string;
  kind: DebtKind;
  status: DebtStatus;
  currentBalance: number;
  originalAmount: number;
  /** YYYY-MM-DD: último día del 0 %. */
  promoEndsOn: string | null;
  promoKind?: TipoDePromo;
  projection: {
    /** YYYY-MM-DD: cuándo termina a la cuota de hoy. */
    payoffDate: string | null;
    neverPaysOff: boolean;
  };
}

/**
 * De dónde sale la fecha de la meta.
 *
 * - `promo`: el fin del 0 %. Es una fecha del contrato, no una estimación, y
 *   la única que de verdad importa en un saldo promocional: pasado ese día,
 *   lo que quede empieza a cobrar interés (o, si es diferido, el de todo el
 *   periodo de golpe).
 * - `ritmo`: cuándo termina a la cuota de hoy. Con esa fecha la meta pide
 *   ~la cuota, que es lo que ya se paga: entra en el Plan como «vas bien», no
 *   como una exigencia nueva.
 * - `sin_fecha`: la cuota de hoy no la termina nunca. Inventar una fecha
 *   escondería justo lo que hay que ver; sin ella el Plan reparte a un año.
 */
export type PorQueEsaFecha = 'promo' | 'ritmo' | 'sin_fecha';

/** Por qué una deuda no se convierte en meta. */
export type PorQueNo = 'pagada' | 'archivada' | 'ya_en_metas' | 'no_encontrada';

export interface MetaPropuesta {
  debtId: string;
  name: string;
  emoji: string;
  kind: 'debt';
  /** El objetivo: lo que se debía (o el saldo, si creció por encima). */
  targetAmount: number;
  /** Lo ya pagado de ese objetivo. */
  savedAmount: number;
  /** Lo que falta: el saldo de la deuda hoy. */
  falta: number;
  /** YYYY-MM-DD o null. */
  targetDate: string | null;
  porQue: PorQueEsaFecha;
  /** Va a la nota de la meta: de dónde vino y por qué esa fecha. */
  note: string;
}

export type Propuesta =
  | { ok: true; meta: MetaPropuesta }
  | { ok: false; debtId: string; motivo: PorQueNo };

export interface PropuestaDeMetas {
  /** Ordenadas por fecha (la más urgente primero, sin fecha al final). */
  metas: MetaPropuesta[];
  omitidas: { debtId: string; motivo: PorQueNo }[];
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partes(clave: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(clave);
  if (!m) return null;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && d >= 1 && d <= 31 ? [y, mes, d] : null;
}

/** «25 ene 2027»: el fin de una promoción es un día del contrato. */
function conDia(clave: string): string {
  const p = partes(clave);
  return p ? `${p[2]} ${MESES[p[1] - 1]} ${p[0]}` : clave;
}

/** «mar 2028»: una estimación no merece el día. */
function soloMes(clave: string): string {
  const p = partes(clave);
  return p ? `${MESES[p[1] - 1]} ${p[0]}` : clave;
}

/** Lo que hace falta saber de una deuda para ponerle fecha a su meta. */
export interface DeudaConFecha {
  /** YYYY-MM-DD: último día del 0 %. */
  promoEndsOn: string | null;
  /** YYYY-MM-DD: cuándo termina a la cuota de hoy. */
  payoffDate: string | null;
  neverPaysOff: boolean;
}

/**
 * La fecha que una deuda le propone a su meta, HOY.
 *
 * Está aparte de `metaDesdeDeuda` porque se usa dos veces: al crear la meta y
 * en cada carga del Plan, para las metas cuya fecha sigue a la deuda
 * (`dateFollowsDebt`). Con una sola función, la fecha que se ve al pasar la
 * deuda a Metas es la que se seguirá viendo, y se mueve con cada abono.
 */
export function fechaQueProponeLaDeuda(
  deuda: DeudaConFecha,
  hoy: string,
): { fecha: string | null; porQue: PorQueEsaFecha } {
  if (deuda.promoEndsOn && promoVigente(deuda.promoEndsOn, hoy)) {
    return { fecha: deuda.promoEndsOn.slice(0, 10), porQue: 'promo' };
  }
  const payoff = deuda.payoffDate?.slice(0, 10) ?? null;
  if (!deuda.neverPaysOff && payoff && payoff >= hoy) return { fecha: payoff, porQue: 'ritmo' };
  return { fecha: null, porQue: 'sin_fecha' };
}

/**
 * La meta que propone una deuda, o por qué no propone ninguna.
 *
 * `hoy` es YYYY-MM-DD en el calendario de quien mira. `enMetas` son las deudas
 * que ya persigue alguna meta: una segunda copia leería las mismas cifras de
 * la misma deuda y el Plan la contaría dos veces.
 */
export function metaDesdeDeuda(
  deuda: DeudaParaMeta,
  hoy: string,
  enMetas: ReadonlySet<string> = new Set(),
): Propuesta {
  if (deuda.status === 'archived') return { ok: false, debtId: deuda.id, motivo: 'archivada' };
  if (enMetas.has(deuda.id)) return { ok: false, debtId: deuda.id, motivo: 'ya_en_metas' };

  const saldo = Number.isFinite(deuda.currentBalance) ? deuda.currentBalance : 0;
  if (deuda.status === 'paid_off' || saldo < POLVO) {
    return { ok: false, debtId: deuda.id, motivo: 'pagada' };
  }

  // Las cifras, con la misma función que usará el Plan al leer la meta.
  const base: FinanceGoal = {
    id: '',
    name: '',
    emoji: '',
    kind: 'debt',
    targetAmount: 0,
    savedAmount: 0,
    targetDate: null,
    priority: 0,
    monthlyOverride: null,
    status: 'active',
    note: null,
    createdAt: '',
    debtId: deuda.id,
  };
  const { targetAmount, savedAmount } = goalWithDebt(base, {
    originalAmount: deuda.originalAmount,
    currentBalance: saldo,
  });

  const { fecha: targetDate, porQue } = fechaQueProponeLaDeuda(
    {
      promoEndsOn: deuda.promoEndsOn,
      payoffDate: deuda.projection.payoffDate,
      neverPaysOff: deuda.projection.neverPaysOff,
    },
    hoy,
  );
  let motivo: string;

  if (porQue === 'promo' && targetDate) {
    motivo =
      deuda.promoKind === 'diferido'
        ? `Para liquidarla antes de que acabe la promoción (${conDia(targetDate)}). ` +
          'Es interés diferido: si ese día queda algo, el banco cobra el interés de todo el periodo.'
        : `Para liquidarla antes de que acabe el 0 % (${conDia(targetDate)}).`;
  } else if (porQue === 'ritmo' && targetDate) {
    motivo = `Con la cuota de hoy la terminas en ${soloMes(targetDate)}.`;
  } else if (deuda.projection.neverPaysOff) {
    motivo = 'Con la cuota de hoy no termina nunca: ponle fecha y el Plan te dice cuánto apartar.';
  } else {
    motivo = 'Sin fecha: ponle una y el Plan te dice cuánto apartar.';
  }

  const name = (deuda.name.trim() || 'Deuda').slice(0, NOMBRE_MAX);

  return {
    ok: true,
    meta: {
      debtId: deuda.id,
      name,
      emoji: EMOJI_DE_DEUDA[deuda.kind] ?? EMOJI_DE_DEUDA.other,
      kind: 'debt',
      targetAmount,
      savedAmount,
      falta: Math.round(Math.max(0, targetAmount - savedAmount) * 100) / 100,
      targetDate,
      porQue,
      note: `Pasada desde Deudas. ${motivo}`,
    },
  };
}

/**
 * Las metas que proponen varias deudas a la vez: los tramos de una tarjeta.
 *
 * `ids` es lo que se pidió; `deudas`, las que se encontraron del usuario. Un
 * id pedido dos veces cuenta una; uno que no aparece sale como
 * `no_encontrada` —nunca se crea una meta de una deuda ajena—.
 *
 * El orden es el de urgencia: primero la que vence antes (el 0 % que se
 * acaba), las sin fecha al final, y a igual fecha la que más debe. Las metas
 * entran al final de la lista del Plan en este orden.
 */
export function proponerMetas(
  ids: readonly string[],
  deudas: readonly DeudaParaMeta[],
  hoy: string,
  enMetas: ReadonlySet<string> = new Set(),
): PropuestaDeMetas {
  const porId = new Map(deudas.map((d) => [d.id, d]));
  const vistos = new Set<string>();
  const metas: MetaPropuesta[] = [];
  const omitidas: { debtId: string; motivo: PorQueNo }[] = [];

  for (const id of ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const deuda = porId.get(id);
    if (!deuda) {
      omitidas.push({ debtId: id, motivo: 'no_encontrada' });
      continue;
    }
    const p = metaDesdeDeuda(deuda, hoy, enMetas);
    if (p.ok) metas.push(p.meta);
    else omitidas.push({ debtId: p.debtId, motivo: p.motivo });
  }

  metas.sort((a, b) => {
    if (a.targetDate !== b.targetDate) {
      if (a.targetDate === null) return 1;
      if (b.targetDate === null) return -1;
      return a.targetDate < b.targetDate ? -1 : 1;
    }
    return b.falta - a.falta;
  });

  return { metas, omitidas };
}

/** Cómo está una tarjeta (o una deuda) respecto a Metas, para el menú. */
export interface ResumenEnMetas {
  /** Las que todavía se pueden pasar. */
  porPasar: number;
  /** Las que ya persigue alguna meta. */
  yaEnMetas: number;
}

/**
 * Lo que el menú necesita para decidir entre «🎯 Pasar a Metas» y «✅ Ver en
 * Metas»: sin esto, un segundo toque ofrecería crear lo que ya existe. Las
 * pagadas no cuentan en ningún lado: no hay nada que perseguir.
 */
export function resumenEnMetas(
  deudas: readonly DeudaParaMeta[],
  hoy: string,
  enMetas: ReadonlySet<string>,
): ResumenEnMetas {
  let porPasar = 0;
  let yaEnMetas = 0;
  for (const d of deudas) {
    const p = metaDesdeDeuda(d, hoy, enMetas);
    if (p.ok) porPasar += 1;
    else if (p.motivo === 'ya_en_metas') yaEnMetas += 1;
  }
  return { porPasar, yaEnMetas };
}
