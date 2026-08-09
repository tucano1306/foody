/**
 * debt-input.ts — validación del cuerpo de las peticiones de Deudas.
 *
 * Vive aparte de las rutas para que la misma regla se aplique al crear y al
 * editar, y para poder probarla sin levantar Next. Todo lo que entra se
 * NORMALIZA además de validarse: recorta cadenas, acota rangos y descarta
 * combinaciones imposibles, de modo que la capa de datos nunca ve basura.
 */
import type {
  DebtKind,
  PayoffStrategy,
  RatePeriod,
} from './debt-engine';
import type { CreateDebtInput, UpdateDebtInput } from './debt-data';
import { normalizeShare } from './expense-scope';

export const DEBT_KINDS: readonly DebtKind[] = [
  'credit_card', 'loan', 'personal', 'mortgage', 'auto', 'store', 'other',
];
export const RATE_PERIODS: readonly RatePeriod[] = ['monthly', 'annual_nominal', 'annual_effective'];
export const PAYOFF_STRATEGIES: readonly PayoffStrategy[] = [
  'fixed_installment', 'by_date', 'minimum', 'interest_only', 'custom',
];

/** Fecha YYYY-MM-DD válida de verdad — rechaza "2026-02-31". */
function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  const real =
    parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
  return real ? text : null;
}

/** Tope de tasa aceptado: 200 % mensual ya es absurdo, pero cabe en DECIMAL(9,4). */
const MAX_RATE = 200;
/** Tope de dinero: DECIMAL(12,2) aguanta hasta 10 dígitos enteros. */
const MAX_MONEY = 9_999_999_999;

export interface ValidationError {
  error: string;
  status: number;
}

export function isValidationError(v: unknown): v is ValidationError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function money(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, 0), MAX_MONEY);
}

/** Solo dígitos, máximo 4 — nunca se guarda el número completo de la tarjeta. */
function last4(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replaceAll(/\D/g, '').slice(-4);
  return digits.length === 4 ? digits : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * Comprueba que la estrategia elegida trae los datos que necesita.
 *
 * Es la validación que más importa: una "cuota fija" sin plazo ni cuota no se
 * puede calcular, y un "monto fijo" en cero dejaría una deuda que jamás baja
 * sin que el usuario lo haya pedido.
 */
function checkStrategy(
  strategy: PayoffStrategy,
  termMonths: number | null,
  customPayment: number | null,
  payoffDate: string | null = null,
): ValidationError | null {
  if (strategy === 'fixed_installment' && !termMonths && !customPayment) {
    return { error: 'Una cuota fija necesita el plazo en meses o la cuota pactada', status: 422 };
  }
  if (strategy === 'by_date' && !payoffDate) {
    return { error: 'Indica la fecha en que debe estar pagada', status: 422 };
  }
  if (strategy === 'custom' && (customPayment === null || customPayment <= 0)) {
    return { error: 'Indica cuánto vas a pagar cada mes', status: 422 };
  }
  return null;
}

export function parseCreateDebt(body: Record<string, unknown>): CreateDebtInput | ValidationError {
  const name = text(body.name, 160);
  if (!name) return { error: 'El nombre es obligatorio', status: 422 };

  const balance = money(body.balance);
  if (balance === null) return { error: 'El saldo debe ser un número', status: 422 };
  if (balance <= 0) return { error: 'El saldo debe ser mayor que cero', status: 422 };

  const rawRate = typeof body.rate === 'number' ? body.rate : Number.parseFloat(String(body.rate ?? ''));
  if (!Number.isFinite(rawRate) || rawRate < 0) {
    return { error: 'La tasa debe ser un número positivo', status: 422 };
  }
  const rate = Math.min(rawRate, MAX_RATE);

  const dueDay = Math.trunc(Number(body.dueDay ?? 1));
  if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) {
    return { error: 'El día de pago debe estar entre 1 y 31', status: 422 };
  }

  const strategy = oneOf(body.strategy, PAYOFF_STRATEGIES) ?? 'fixed_installment';
  const rawTerm = Math.trunc(Number(body.termMonths ?? 0));
  const termMonths = Number.isFinite(rawTerm) && rawTerm > 0 ? Math.min(rawTerm, 600) : null;
  const customPayment = body.customPayment == null ? null : money(body.customPayment);
  const payoffDate = isoDate(body.payoffDate);

  const strategyError = checkStrategy(strategy, termMonths, customPayment, payoffDate);
  if (strategyError) return strategyError;

  const rawMinPercent = body.minPercent == null ? null : Number(body.minPercent);
  const minPercent =
    rawMinPercent !== null && Number.isFinite(rawMinPercent) && rawMinPercent > 0
      ? Math.min(rawMinPercent, 100)
      : null;

  return {
    name,
    kind: oneOf(body.kind, DEBT_KINDS) ?? 'credit_card',
    issuer: text(body.issuer, 100),
    accountLast4: last4(body.accountLast4),
    currency: text(body.currency, 10) ?? 'USD',
    balance,
    rate,
    ratePeriod: oneOf(body.ratePeriod, RATE_PERIODS) ?? 'monthly',
    strategy,
    termMonths,
    payoffDate,
    customPayment,
    minPercent,
    minFloor: body.minFloor == null ? null : money(body.minFloor),
    extraMonthly: money(body.extraMonthly) ?? 0,
    businessShare: normalizeShare(body.businessShare),
    creditLimit: body.creditLimit == null ? null : money(body.creditLimit),
    dueDay,
    note: text(body.note, 1000),
  };
}

/**
 * Igual que el alta, pero cada campo es opcional: solo se toca lo que venga.
 * El saldo NO es editable aquí a propósito — se mueve con movimientos del libro
 * mayor, que es lo que mantiene el historial cuadrado.
 */
export function parseUpdateDebt(body: Record<string, unknown>): UpdateDebtInput | ValidationError {
  const out: UpdateDebtInput = {};

  if (body.name !== undefined) {
    const name = text(body.name, 160);
    if (!name) return { error: 'El nombre no puede quedar vacío', status: 422 };
    out.name = name;
  }

  if (body.rate !== undefined) {
    const n = Number(body.rate);
    if (!Number.isFinite(n) || n < 0) return { error: 'La tasa debe ser un número positivo', status: 422 };
    out.rate = Math.min(n, MAX_RATE);
  }

  if (body.dueDay !== undefined) {
    const d = Math.trunc(Number(body.dueDay));
    if (!Number.isFinite(d) || d < 1 || d > 31) {
      return { error: 'El día de pago debe estar entre 1 y 31', status: 422 };
    }
    out.dueDay = d;
  }

  // Enlazar/desenlazar con un recibo de Pagos, o descartar la sospecha de
  // duplicado. Cadena vacía y null significan lo mismo: quitar el enlace.
  if (body.linkedPaymentId !== undefined) {
    const raw = body.linkedPaymentId;
    if (raw === null || raw === '') {
      out.linkedPaymentId = null;
    } else if (typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw.trim())) {
      out.linkedPaymentId = raw.trim();
    } else {
      return { error: 'El pago enlazado no es válido', status: 422 };
    }
  }
  if (body.duplicateDismissed !== undefined) {
    out.duplicateDismissed = Boolean(body.duplicateDismissed);
  }

  if (body.kind !== undefined) out.kind = oneOf(body.kind, DEBT_KINDS) ?? undefined;
  if (body.ratePeriod !== undefined) out.ratePeriod = oneOf(body.ratePeriod, RATE_PERIODS) ?? undefined;
  if (body.strategy !== undefined) out.strategy = oneOf(body.strategy, PAYOFF_STRATEGIES) ?? undefined;
  if (body.issuer !== undefined) out.issuer = text(body.issuer, 100);
  if (body.accountLast4 !== undefined) out.accountLast4 = last4(body.accountLast4);
  if (body.currency !== undefined) out.currency = text(body.currency, 10) ?? 'USD';
  if (body.note !== undefined) out.note = text(body.note, 1000);

  if (body.termMonths !== undefined) {
    const t = Math.trunc(Number(body.termMonths));
    out.termMonths = Number.isFinite(t) && t > 0 ? Math.min(t, 600) : null;
  }
  if (body.payoffDate !== undefined) out.payoffDate = isoDate(body.payoffDate);
  if (body.customPayment !== undefined) out.customPayment = body.customPayment == null ? null : money(body.customPayment);
  if (body.minPercent !== undefined) {
    const p = Number(body.minPercent);
    out.minPercent = Number.isFinite(p) && p > 0 ? Math.min(p, 100) : null;
  }
  if (body.minFloor !== undefined) out.minFloor = body.minFloor == null ? null : money(body.minFloor);
  if (body.extraMonthly !== undefined) out.extraMonthly = money(body.extraMonthly) ?? 0;
  if (body.businessShare !== undefined) out.businessShare = normalizeShare(body.businessShare);
  if (body.creditLimit !== undefined) out.creditLimit = body.creditLimit == null ? null : money(body.creditLimit);
  if (body.status !== undefined) {
    const s = oneOf(body.status, ['active', 'paid_off', 'archived'] as const);
    if (s) out.status = s;
  }

  // La combinación resultante también tiene que ser calculable.
  if (out.strategy !== undefined) {
    const err = checkStrategy(
      out.strategy,
      out.termMonths ?? null,
      out.customPayment ?? null,
      out.payoffDate ?? null,
    );
    // Solo se rechaza si el propio cuerpo trae la estrategia Y le faltan datos
    // que tampoco venían antes; si no, se confía en lo ya guardado.
    if (
      err &&
      (body.termMonths !== undefined || body.customPayment !== undefined || body.payoffDate !== undefined)
    ) {
      return err;
    }
    // Cambiar A «fecha límite» sin dar fecha sí es un error siempre: no hay
    // dato anterior en el que apoyarse para calcular la cuota.
    if (out.strategy === 'by_date' && !out.payoffDate && body.payoffDate === undefined) {
      return { error: 'Indica la fecha en que debe estar pagada', status: 422 };
    }
  }

  return out;
}

/** Valida el cuerpo de un abono. */
export function parsePaymentAmount(body: Record<string, unknown>): number | ValidationError {
  const amount = money(body.amount);
  if (amount === null) return { error: 'El monto debe ser un número', status: 422 };
  if (amount <= 0) return { error: 'El monto debe ser mayor que cero', status: 422 };
  return amount;
}
