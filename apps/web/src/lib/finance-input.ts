/**
 * finance-input.ts — validación de los cuerpos JSON del Plan Financiero.
 *
 * Vive fuera de los route handlers (que solo pueden exportar handlers) y se
 * comparte entre crear y editar, para que una meta creada y una editada pasen
 * exactamente por las mismas reglas.
 */
import { GOAL_KINDS, GOAL_STATUSES, INCOME_FREQUENCIES } from '@/lib/finance-data';
import type { GoalKind, GoalStatus, IncomeFrequency } from '@/lib/finance-engine';

export interface ValidationError {
  error: string;
}

export function isError<T>(value: T | ValidationError): value is ValidationError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

const MAX_AMOUNT = 100_000_000;

export function parseAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

/** Acepta "YYYY-MM-DD" (o un ISO completo) y devuelve solo la parte de fecha. */
export function parseDateInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  return valid ? text : null;
}

function parseText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// ─── Metas ────────────────────────────────────────────────────────────────────

export interface GoalInput {
  name: string;
  emoji: string;
  kind: GoalKind;
  targetAmount: number;
  savedAmount: number;
  targetDate: string | null;
  priority: number;
  monthlyOverride: number | null;
  status: GoalStatus;
  note: string | null;
}

export function validateGoalBody(body: Record<string, unknown>): GoalInput | ValidationError {
  const name = parseText(body.name, 160);
  if (!name) return { error: 'El nombre de la meta es obligatorio' };

  const targetAmount = parseAmount(body.targetAmount);
  if (targetAmount === null || targetAmount <= 0) {
    return { error: 'El monto objetivo debe ser un número mayor a 0' };
  }

  const savedAmount = parseAmount(body.savedAmount ?? 0);
  if (savedAmount === null) return { error: 'El monto ahorrado no es válido' };

  let targetDate: string | null = null;
  if (body.targetDate != null && body.targetDate !== '') {
    targetDate = parseDateInput(body.targetDate);
    if (!targetDate) return { error: 'La fecha objetivo debe tener formato AAAA-MM-DD' };
  }

  const kindRaw = typeof body.kind === 'string' ? (body.kind as GoalKind) : 'project';
  const kind = GOAL_KINDS.includes(kindRaw) ? kindRaw : 'project';

  const statusRaw = typeof body.status === 'string' ? (body.status as GoalStatus) : 'active';
  const status = GOAL_STATUSES.includes(statusRaw) ? statusRaw : 'active';

  const priorityRaw = typeof body.priority === 'number' ? Math.trunc(body.priority) : 2;
  const priority = Math.min(3, Math.max(1, Number.isFinite(priorityRaw) ? priorityRaw : 2));

  let monthlyOverride: number | null = null;
  if (body.monthlyOverride != null && body.monthlyOverride !== '') {
    monthlyOverride = parseAmount(body.monthlyOverride);
    if (monthlyOverride === null) return { error: 'El aporte mensual no es válido' };
    if (monthlyOverride === 0) monthlyOverride = null;
  }

  return {
    name,
    emoji: parseText(body.emoji, 12) || '🎯',
    kind,
    targetAmount,
    savedAmount,
    targetDate,
    priority,
    monthlyOverride,
    status,
    note: parseText(body.note, 1000) || null,
  };
}

// ─── Ingresos ─────────────────────────────────────────────────────────────────

export interface IncomeInput {
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  isActive: boolean;
  note: string | null;
}

export function validateIncomeBody(body: Record<string, unknown>): IncomeInput | ValidationError {
  const name = parseText(body.name, 120);
  if (!name) return { error: 'El nombre del ingreso es obligatorio' };

  const amount = parseAmount(body.amount);
  if (amount === null || amount <= 0) return { error: 'El monto debe ser un número mayor a 0' };

  const freqRaw = typeof body.frequency === 'string' ? (body.frequency as IncomeFrequency) : 'monthly';
  const frequency = INCOME_FREQUENCIES.includes(freqRaw) ? freqRaw : 'monthly';

  return {
    name,
    amount,
    frequency,
    isActive: body.isActive == null ? true : Boolean(body.isActive),
    note: parseText(body.note, 500) || null,
  };
}
