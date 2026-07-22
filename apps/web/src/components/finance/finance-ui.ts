/**
 * finance-ui.ts — vocabulario visual del Plan Financiero.
 *
 * Paleta pastel: cada tipo de meta y cada tono de consejo tiene su familia de
 * color, definida una sola vez aquí para que tarjetas, modales y feed se vean
 * como un mismo sistema (y para que el modo oscuro se ajuste en un solo lugar).
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
  /** Degradado pastel del encabezado de la tarjeta. */
  gradient: string;
  chip: string;
  ring: string;
  accent: string;
}

export const KIND_META: Record<GoalKind, KindMeta> = {
  trip: {
    label: 'Viaje',
    emoji: '✈️',
    gradient: 'from-sky-100 to-cyan-100 dark:from-sky-500/15 dark:to-cyan-500/10',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200',
    ring: '#7dd3fc',
    accent: 'text-sky-600 dark:text-sky-300',
  },
  debt: {
    label: 'Deuda',
    emoji: '💳',
    gradient: 'from-rose-100 to-orange-100 dark:from-rose-500/15 dark:to-orange-500/10',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
    ring: '#fda4af',
    accent: 'text-rose-600 dark:text-rose-300',
  },
  project: {
    label: 'Proyecto',
    emoji: '🏗️',
    gradient: 'from-violet-100 to-fuchsia-100 dark:from-violet-500/15 dark:to-fuchsia-500/10',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200',
    ring: '#c4b5fd',
    accent: 'text-violet-600 dark:text-violet-300',
  },
  purchase: {
    label: 'Compra',
    emoji: '🛍️',
    gradient: 'from-amber-100 to-yellow-100 dark:from-amber-500/15 dark:to-yellow-500/10',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
    ring: '#fcd34d',
    accent: 'text-amber-600 dark:text-amber-300',
  },
  emergency: {
    label: 'Fondo',
    emoji: '🛟',
    gradient: 'from-emerald-100 to-teal-100 dark:from-emerald-500/15 dark:to-teal-500/10',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
    ring: '#6ee7b7',
    accent: 'text-emerald-600 dark:text-emerald-300',
  },
};

export interface FeasibilityMeta {
  label: string;
  icon: string;
  chip: string;
}

export const FEASIBILITY_META: Record<Feasibility, FeasibilityMeta> = {
  done:     { label: 'Lograda',      icon: '🎉', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' },
  on_track: { label: 'En camino',    icon: '✅', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' },
  tight:    { label: 'Va justa',     icon: '🎯', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200' },
  at_risk:  { label: 'En riesgo',    icon: '⚠️', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200' },
  overdue:  { label: 'Fecha vencida', icon: '📅', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200' },
  no_date:  { label: 'Sin fecha',    icon: '🗓️', chip: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
};

export interface ToneMeta {
  card: string;
  title: string;
  body: string;
  button: string;
}

export const TONE_META: Record<AdviceTone, ToneMeta> = {
  critical: {
    card: 'bg-rose-50/90 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30',
    title: 'text-rose-800 dark:text-rose-200',
    body: 'text-rose-700/90 dark:text-rose-100/80',
    button: 'bg-rose-500 hover:bg-rose-600 text-white',
  },
  warning: {
    card: 'bg-amber-50/90 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30',
    title: 'text-amber-800 dark:text-amber-200',
    body: 'text-amber-700/90 dark:text-amber-100/80',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  idea: {
    card: 'bg-violet-50/90 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30',
    title: 'text-violet-800 dark:text-violet-200',
    body: 'text-violet-700/90 dark:text-violet-100/80',
    button: 'bg-violet-500 hover:bg-violet-600 text-white',
  },
  good: {
    card: 'bg-emerald-50/90 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    title: 'text-emerald-800 dark:text-emerald-200',
    body: 'text-emerald-700/90 dark:text-emerald-100/80',
    button: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  },
  info: {
    card: 'bg-sky-50/90 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/30',
    title: 'text-sky-800 dark:text-sky-200',
    body: 'text-sky-700/90 dark:text-sky-100/80',
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

/** Color del anillo de salud: pastel verde → ámbar → rosa. */
export function healthColor(score: number): string {
  if (score >= 75) return '#34d399';
  if (score >= 45) return '#fbbf24';
  return '#fb7185';
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
