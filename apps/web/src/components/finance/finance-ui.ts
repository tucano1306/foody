/**
 * finance-ui.ts — vocabulario visual del Plan Financiero.
 *
 * Una sola familia de color: azul pastel claro. El significado (meta en
 * riesgo, consejo crítico, deuda) NO se comunica con rojos ni verdes, sino con
 * la profundidad del azul, el emoji y el texto. Las cifras van en negro para
 * que sean lo único que destaque sobre el fondo claro.
 *
 * Esta sección NO cambia con el tema oscuro: las cifras son negras siempre
 * (decisión del usuario), así que las superficies tienen que seguir claras o
 * el negro quedaría ilegible. Por eso aquí no hay variantes `dark:`.
 */
import type { AdviceTone, Feasibility, GoalKind, IncomeFrequency } from '@/lib/finance-engine';

export const fmtMoney = (n: number, decimals = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);

/** $1,234.56 solo cuando el decimal aporta (aportes, cuotas semanales). */
export const fmtMoneyFine = (n: number) => (Number.isInteger(n) ? fmtMoney(n) : fmtMoney(n, 2));

// ─── Tokens compartidos ───────────────────────────────────────────────────────

/** Cifras: negro absoluto, en cualquier tema. */
export const NUM = 'text-black';
/** Cifra secundaria (comparativas, totales de apoyo). */
export const NUM_SOFT = 'text-slate-700';
/** Texto de etiqueta sobre superficie azul pastel. */
export const LABEL = 'text-slate-600';
/** Superficie base de las tarjetas. */
export const CARD = 'bg-sky-50/70 border border-sky-100';
/** Encabezado degradado pastel. */
export const HEADER_GRADIENT = 'from-sky-100 to-blue-100';
/** Botón principal. */
export const BTN_PRIMARY = 'bg-sky-500 hover:bg-sky-600 text-white';
/** Botón secundario sobre pastel. */
export const BTN_SOFT = 'bg-white/80 text-slate-800 hover:bg-white';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatDateKey(key: string | null, short = false): string {
  if (!key) return 'Sin fecha';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  const mes = MONTHS_ES[m - 1] ?? '';
  return short ? `${d} ${mes.slice(0, 3)} ${String(y).slice(-2)}` : `${d} de ${mes} de ${y}`;
}

export interface KindMeta {
  label: string;
  emoji: string;
  gradient: string;
  chip: string;
  /** Color del anillo de progreso — todos en la gama azul. */
  ring: string;
}

const CHIP = 'bg-sky-100 text-slate-800';

export const KIND_META: Record<GoalKind, KindMeta> = {
  trip:      { label: 'Viaje',    emoji: '✈️', gradient: HEADER_GRADIENT, chip: CHIP, ring: '#38bdf8' },
  debt:      { label: 'Deuda',    emoji: '💳', gradient: HEADER_GRADIENT, chip: CHIP, ring: '#0ea5e9' },
  project:   { label: 'Proyecto', emoji: '🏗️', gradient: HEADER_GRADIENT, chip: CHIP, ring: '#60a5fa' },
  purchase:  { label: 'Compra',   emoji: '🛍️', gradient: HEADER_GRADIENT, chip: CHIP, ring: '#7dd3fc' },
  emergency: { label: 'Fondo',    emoji: '🛟', gradient: HEADER_GRADIENT, chip: CHIP, ring: '#93c5fd' },
};

export interface FeasibilityMeta {
  label: string;
  icon: string;
  chip: string;
}

/** El estado lo dice el emoji y la palabra; el azul solo cambia de intensidad. */
export const FEASIBILITY_META: Record<Feasibility, FeasibilityMeta> = {
  done:     { label: 'Lograda',       icon: '🎉', chip: 'bg-sky-200 text-slate-900' },
  on_track: { label: 'En camino',     icon: '✅', chip: 'bg-sky-100 text-slate-800' },
  tight:    { label: 'Va justa',      icon: '🎯', chip: 'bg-blue-200 text-slate-900' },
  at_risk:  { label: 'En riesgo',     icon: '⚠️', chip: 'bg-blue-300 text-slate-900' },
  overdue:  { label: 'Fecha vencida', icon: '📅', chip: 'bg-blue-300 text-slate-900' },
  no_date:  { label: 'Sin fecha',     icon: '🗓️', chip: 'bg-sky-50 text-slate-600' },
};

export interface ToneMeta {
  card: string;
  title: string;
  body: string;
  button: string;
}

/**
 * La gravedad del consejo se lee en el borde izquierdo: cuanto más oscuro el
 * azul, más urgente. El icono hace el resto.
 */
export const TONE_META: Record<AdviceTone, ToneMeta> = {
  critical: {
    card: 'bg-sky-100/80 border-sky-200 border-l-4 border-l-blue-500',
    title: 'text-slate-900',
    body: 'text-slate-700',
    button: 'bg-blue-500 hover:bg-blue-600 text-white',
  },
  warning: {
    card: 'bg-sky-50/90 border-sky-200 border-l-4 border-l-sky-400',
    title: 'text-slate-900',
    body: 'text-slate-700',
    button: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
  idea: {
    card: 'bg-sky-50/70 border-sky-100 border-l-4 border-l-sky-300',
    title: 'text-slate-900',
    body: 'text-slate-700',
    button: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
  good: {
    card: 'bg-blue-50/70 border-sky-100 border-l-4 border-l-sky-200',
    title: 'text-slate-900',
    body: 'text-slate-700',
    button: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
  info: {
    card: 'bg-sky-50/60 border-sky-100 border-l-4 border-l-sky-200',
    title: 'text-slate-900',
    body: 'text-slate-700',
    button: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
};

export const FREQUENCY_LABEL: Record<IncomeFrequency, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
  yearly: 'Anual',
  one_time: 'Una sola vez',
};

export const PRIORITY_LABEL: Record<number, string> = {
  1: 'Alta',
  2: 'Normal',
  3: 'Cuando se pueda',
};

/** Anillo de salud: azul intenso cuando va bien, azul apagado cuando no. */
export function healthColor(score: number): string {
  if (score >= 75) return '#0ea5e9';
  if (score >= 45) return '#60a5fa';
  return '#93c5fd';
}

export function healthLabel(score: number): string {
  if (score >= 85) return 'Excelente';
  if (score >= 70) return 'Saludable';
  if (score >= 45) return 'Mejorable';
  if (score > 0) return 'Delicada';
  return 'Sin datos';
}

/** Fecha de hoy en YYYY-MM-DD (hora local) para los <input type="date">. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
