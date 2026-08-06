/**
 * debt-ui.ts — vocabulario visual de Deudas y Créditos.
 *
 * Misma familia que el Plan Financiero: un solo azul, cifras en negro, y el
 * significado (deuda sana, estancada, sin salida) se comunica con la INTENSIDAD
 * del azul, el emoji y la palabra — nunca con rojos y verdes. Así la sección
 * entra en la app sin parecer un injerto.
 *
 * La única excepción deliberada es la barra de reparto: ahí el interés y el
 * capital SÍ necesitan dos tonos claramente distintos, porque su contraste es
 * el mensaje entero de la pantalla.
 */
import type { DebtKind, PayoffStrategy, ProjectionStatus, RatePeriod } from '@/lib/debt-engine';

// ─── Dinero ───────────────────────────────────────────────────────────────────

export function fmtMoney(value: number, currency = 'USD', decimals = 2): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(decimals)}`;
  }
}

/** Sin centavos cuando no aportan: $1,240 se lee mejor que $1,240.00. */
export const fmtMoneyShort = (value: number, currency = 'USD') =>
  fmtMoney(value, currency, Number.isInteger(value) ? 0 : 2);

/** "3 % mensual" / "36 % anual" — la tasa como la escribió el usuario. */
export function fmtRate(rate: number, period: RatePeriod): string {
  const clean = Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2).replace(/0$/, '');
  return `${clean} % ${RATE_PERIOD_META[period].short}`;
}

/** "2 años y 3 meses", "8 meses" — plazos en cristiano. */
export function fmtMonths(months: number | null): string {
  if (months === null) return 'nunca';
  if (months <= 0) return 'ya';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yearPart = y > 0 ? `${y} año${y === 1 ? '' : 's'}` : '';
  const monthPart = m > 0 ? `${m} mes${m === 1 ? '' : 'es'}` : '';
  return [yearPart, monthPart].filter(Boolean).join(' y ') || '0 meses';
}

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** "mar 2028" a partir de un YYYY-MM-DD. */
export function fmtDateKey(key: string | null): string {
  if (!key) return '—';
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return `${MONTHS_ES[m - 1] ?? ''} ${y}`;
}

/**
 * "14 feb 2027" — con el día.
 *
 * Una fecha límite necesita el día exacto: "feb 2027" no sirve para saber si
 * quedan tres días o treinta.
 */
export function fmtDateFull(key: string | null): string {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS_ES[m - 1] ?? ''} ${y}`;
}

// ─── Tokens compartidos ───────────────────────────────────────────────────────

export const NUM = 'text-black';
export const LABEL = 'text-slate-600';
export const CARD = 'bg-white border border-sky-100';
export const HEADER_GRADIENT = 'from-sky-100 to-blue-100';
export const BTN_PRIMARY =
  'bg-sky-500 hover:bg-sky-600 active:scale-95 text-white font-bold transition-all duration-150';
export const BTN_SOFT =
  'bg-white/80 hover:bg-white active:scale-95 text-slate-800 font-semibold transition-all duration-150';

/** Los dos colores de la barra de reparto — el contraste ES el mensaje. */
export const SPLIT_INTEREST = '#1d4ed8'; // azul profundo: lo que se lleva el banco
export const SPLIT_PRINCIPAL = '#7dd3fc'; // azul claro: lo que sí baja tu deuda

// ─── Tipo de deuda ────────────────────────────────────────────────────────────

export interface KindMeta {
  label: string;
  emoji: string;
  /** Frase de una línea para la tarjeta de elección. Sin instrucciones. */
  hint: string;
}

export const KIND_META: Record<DebtKind, KindMeta> = {
  credit_card: { label: 'Tarjeta', emoji: '💳', hint: 'De crédito' },
  loan: { label: 'Préstamo', emoji: '🏦', hint: 'Del banco' },
  personal: { label: 'Personal', emoji: '🤝', hint: 'A alguien' },
  mortgage: { label: 'Hipoteca', emoji: '🏠', hint: 'Tu casa' },
  auto: { label: 'Auto', emoji: '🚗', hint: 'Tu carro' },
  store: { label: 'Tienda', emoji: '🛍️', hint: 'A plazos' },
  other: { label: 'Otra', emoji: '📄', hint: 'Cualquiera' },
};

export const KIND_ORDER: readonly DebtKind[] = [
  'credit_card', 'loan', 'auto', 'mortgage', 'store', 'personal', 'other',
];

// ─── Período de la tasa ───────────────────────────────────────────────────────

export const RATE_PERIOD_META: Record<RatePeriod, { label: string; short: string; hint: string }> = {
  monthly: { label: 'Al mes', short: 'mensual', hint: 'Lo más común' },
  annual_nominal: { label: 'Al año', short: 'anual', hint: 'Nominal' },
  annual_effective: { label: 'Anual real', short: 'anual efectiva', hint: 'TEA' },
};

// ─── Estrategia de pago ───────────────────────────────────────────────────────

export interface StrategyMeta {
  label: string;
  emoji: string;
  /** Qué significa, en una frase que se entiende sin saber de finanzas. */
  hint: string;
}

export const STRATEGY_META: Record<PayoffStrategy, StrategyMeta> = {
  fixed_installment: { label: 'Cuota fija', emoji: '📆', hint: 'A plazo, misma cuota' },
  by_date: { label: 'Fecha límite', emoji: '🗓️', hint: 'Pagada antes de…' },
  minimum: { label: 'Pago mínimo', emoji: '🪙', hint: 'Lo que exige el banco' },
  interest_only: { label: 'Solo intereses', emoji: '♾️', hint: 'La deuda no baja' },
  custom: { label: 'Yo decido', emoji: '✍️', hint: 'Un monto fijo' },
};

export const STRATEGY_ORDER: readonly PayoffStrategy[] = [
  'fixed_installment', 'by_date', 'minimum', 'custom', 'interest_only',
];

// ─── Salud de la deuda ────────────────────────────────────────────────────────

export interface StatusMeta {
  label: string;
  emoji: string;
  chip: string;
  /** Color del anillo de progreso. */
  ring: string;
}

export const STATUS_META: Record<ProjectionStatus, StatusMeta> = {
  paid: { label: 'Liquidada', emoji: '🎉', chip: 'bg-sky-200 text-slate-900', ring: '#38bdf8' },
  healthy: { label: 'En camino', emoji: '✅', chip: 'bg-sky-100 text-slate-800', ring: '#0ea5e9' },
  slow: { label: 'Va lenta', emoji: '🕐', chip: 'bg-blue-100 text-slate-800', ring: '#3b82f6' },
  stagnant: { label: 'Casi no baja', emoji: '🐌', chip: 'bg-blue-200 text-slate-900', ring: '#2563eb' },
  never: { label: 'Sin salida', emoji: '🛑', chip: 'bg-blue-300 text-slate-900', ring: '#1d4ed8' },
};

// ─── Movimientos del libro mayor ──────────────────────────────────────────────

export const MOVEMENT_META: Record<string, { label: string; emoji: string; sign: '+' | '−' }> = {
  charge: { label: 'Consumo', emoji: '🛒', sign: '+' },
  payment: { label: 'Abono', emoji: '✅', sign: '−' },
  interest: { label: 'Interés', emoji: '📈', sign: '+' },
  fee: { label: 'Comisión', emoji: '⚠️', sign: '+' },
  adjustment: { label: 'Ajuste', emoji: '✏️', sign: '+' },
};
