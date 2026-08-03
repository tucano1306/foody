/**
 * goal-impact.ts — traduce un gasto en su efecto sobre las metas.
 *
 * Responde a la pregunta que el usuario hace de verdad: "acabo de gastar $80,
 * ¿eso me aleja del viaje?". El plan ya dice cuánto apartar al mes; esto dice
 * cuánto cuesta cada compra en días de retraso.
 *
 * Módulo PURO: sin SQL, sin React, sin fechas implícitas. Se usa igual en el
 * servidor (para las notificaciones) y en el navegador (para el aviso al vuelo).
 *
 * Escenarios límite cubiertos y probados en goal-impact.test.ts:
 *  - gasto 0 o negativo (una devolución no debe "retrasar" nada)
 *  - meta sin ritmo asignado (allocatedMonthly = 0) → sin división por cero
 *  - meta ya cubierta o pausada → se ignora
 *  - gasto mayor que la meta entera
 *  - metas sin fecha límite
 */
import { DAYS_PER_MONTH, monthsToReach, type GoalProjection } from './finance-engine';

/** Gravedad del aviso, para que la UI no tenga que decidirla. */
export type ImpactLevel = 'none' | 'low' | 'medium' | 'high';

export interface GoalImpact {
  goalId: string;
  name: string;
  emoji: string;
  /** Días que se retrasa la meta por este gasto. 0 si no la afecta. */
  daysDelayed: number;
  /** Parte del aporte mensual de esta meta que se llevó el gasto (0–1+). */
  shareOfMonthly: number;
  level: ImpactLevel;
  /** Frase lista para mostrar, ya en español y sin jerga. */
  message: string;
}

export interface ExpenseImpactInput {
  /** Monto del gasto. 0 o negativo → sin impacto. */
  amount: number;
  /** Proyecciones del plan vigente. */
  goals: readonly GoalProjection[];
  /**
   * Dinero libre del mes ya descontados pagos fijos y súper. Un gasto que cabe
   * en el colchón sin asignar no retrasa ninguna meta.
   */
  unallocatedMonthly?: number;
}

export interface ExpenseImpactResult {
  /** Impactos por meta, el más grave primero. Vacío si el gasto no afecta. */
  impacts: GoalImpact[];
  /** El impacto más grave, para un aviso de una sola línea. */
  worst: GoalImpact | null;
  /** Suma de días de retraso en todas las metas. */
  totalDaysDelayed: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

/** Umbrales: qué fracción del aporte mensual convierte el gasto en un aviso. */
const LEVEL_THRESHOLDS: readonly { min: number; level: ImpactLevel }[] = [
  { min: 0.5, level: 'high' },
  { min: 0.2, level: 'medium' },
  { min: 0.05, level: 'low' },
];

export function levelFor(shareOfMonthly: number): ImpactLevel {
  for (const { min, level } of LEVEL_THRESHOLDS) {
    if (shareOfMonthly >= min) return level;
  }
  return 'none';
}

/**
 * Días de retraso de una meta al restarle `amount` de su aporte mensual.
 *
 * Se razona sobre el ritmo, no sobre el saldo: si la meta recibe $600 al mes y
 * el gasto se come $200, ese mes avanza un tercio menos, y ese tercio se
 * traduce a días según el propio ritmo diario de la meta.
 */
export function daysDelayedBy(amount: number, allocatedMonthly: number): number {
  if (amount <= 0) return 0;
  if (allocatedMonthly <= 0) return 0; // sin ritmo no hay retraso que medir
  const dailyRate = allocatedMonthly / DAYS_PER_MONTH;
  return round1(amount / dailyRate);
}

function messageFor(goal: GoalProjection, daysDelayed: number, amount: number): string {
  if (daysDelayed <= 0) return `No afecta a «${goal.name}».`;
  if (daysDelayed < 1) return `«${goal.name}» se retrasa menos de un día.`;
  const dias = Math.round(daysDelayed);
  const cuando = goal.targetDate ? '' : ' de tu ritmo actual';
  return `${money(amount)} = ${dias} ${dias === 1 ? 'día' : 'días'} más${cuando} para «${goal.name}».`;
}

/**
 * Efecto de un gasto sobre las metas activas.
 *
 * El gasto se absorbe primero con el dinero sin asignar del mes: solo lo que
 * excede ese colchón sale del ritmo de las metas, y se reparte entre ellas en
 * proporción a lo que cada una recibe.
 */
export function computeExpenseImpact(input: ExpenseImpactInput): ExpenseImpactResult {
  const empty: ExpenseImpactResult = { impacts: [], worst: null, totalDaysDelayed: 0 };

  const amount = input.amount;
  if (!Number.isFinite(amount) || amount <= 0) return empty;

  const active = input.goals.filter((g) => g.status === 'active' && g.remaining > 0 && g.allocatedMonthly > 0);
  if (active.length === 0) return empty;

  // El colchón sin asignar amortigua el golpe antes de tocar las metas.
  const cushion = Math.max(0, input.unallocatedMonthly ?? 0);
  const effective = Math.max(0, amount - cushion);
  if (effective <= 0) return empty;

  const totalAllocated = active.reduce((s, g) => s + g.allocatedMonthly, 0);

  const impacts: GoalImpact[] = active.map((goal) => {
    // Cada meta absorbe la parte proporcional a lo que recibe.
    const share = goal.allocatedMonthly / totalAllocated;
    const hit = effective * share;
    const daysDelayed = daysDelayedBy(hit, goal.allocatedMonthly);
    const shareOfMonthly = round1((hit / goal.allocatedMonthly) * 100) / 100;
    return {
      goalId: goal.goalId,
      name: goal.name,
      emoji: goal.emoji,
      daysDelayed,
      shareOfMonthly,
      level: levelFor(shareOfMonthly),
      message: messageFor(goal, daysDelayed, hit),
    };
  });

  impacts.sort((a, b) => b.daysDelayed - a.daysDelayed);

  return {
    impacts,
    worst: impacts[0] ?? null,
    totalDaysDelayed: round1(impacts.reduce((s, i) => s + i.daysDelayed, 0)),
  };
}

/**
 * Lo contrario: cuánto ADELANTA una meta un ahorro o un ingreso extra.
 * Se usa para el mensaje positivo tras registrar un aporte.
 */
export function monthsAdvancedBy(goal: GoalProjection, extra: number): number {
  if (extra <= 0 || goal.remaining <= 0 || goal.allocatedMonthly <= 0) return 0;
  const before = monthsToReach(goal.remaining, goal.allocatedMonthly);
  const after = monthsToReach(goal.remaining, goal.allocatedMonthly + extra);
  if (before === null || after === null) return 0;
  return Math.max(0, before - after);
}
