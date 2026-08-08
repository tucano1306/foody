/**
 * plan-diff.ts — qué cambió en tus metas cuando entró información nueva.
 *
 * El plan se recalcula solo cada vez que se registra un gasto, un ingreso o un
 * aporte, pero el usuario veía la pantalla cambiar sin saber QUÉ había cambiado
 * ni por qué. Este módulo compara el plan de antes con el de después y lo dice
 * en una frase: "tu viaje se adelanta 2 meses", "la meta ya no llega a tiempo".
 *
 * Compara PROYECCIONES, no saldos: lo que importa no es que hayas ahorrado $50,
 * sino si eso mueve la fecha de la meta.
 *
 * Módulo PURO: sin fetch, sin React, sin fechas implícitas. Se prueba en
 * plan-diff.test.ts.
 */
import type { CashFlow, Feasibility, GoalProjection } from './finance-engine';

export type PlanChangeTone = 'good' | 'warning' | 'info';

export interface PlanChange {
  /** Estable, para poder deduplicar o testear sin depender del texto. */
  id: string;
  tone: PlanChangeTone;
  /** Frase lista para mostrar, en español y sin jerga. */
  message: string;
  /**
   * Peso para elegir UNA sola cosa que decir. Más alto = más importante.
   * Las malas noticias pesan más que las buenas: enterarse de que una meta
   * dejó de llegar a tiempo es más urgente que celebrar que se adelantó.
   */
  weight: number;
}

export interface PlanSnapshot {
  goals: readonly GoalProjection[];
  cashFlow: Pick<CashFlow, 'available' | 'goalsBudget'>;
}

/** Cambio mínimo en el dinero libre para que merezca mencionarse. */
const MIN_MONEY_DELTA = 1;

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;

/**
 * Meses entre dos fechas proyectadas (YYYY-MM-DD). Positivo = `after` es más
 * tarde que `before`, es decir, la meta se RETRASÓ.
 */
export function monthsBetween(before: string, after: string): number {
  const a = /^(\d{4})-(\d{2})/.exec(before);
  const b = /^(\d{4})-(\d{2})/.exec(after);
  if (!a || !b) return 0;
  return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
}

/** Pasar a esto son malas noticias; salir de esto, buenas. */
const BAD: readonly Feasibility[] = ['at_risk', 'overdue'];

function isBad(f: Feasibility): boolean {
  return BAD.includes(f);
}

/**
 * Compara dos fotos del plan y devuelve lo que cambió, lo más importante
 * primero. Lista vacía = nada digno de mención (que es lo normal).
 */
export function diffPlans(before: PlanSnapshot, after: PlanSnapshot): PlanChange[] {
  const out: PlanChange[] = [];
  const previous = new Map(before.goals.map((g) => [g.goalId, g]));

  for (const now of after.goals) {
    if (now.status !== 'active') continue;
    const was = previous.get(now.goalId);
    if (!was) continue;

    const nombre = `«${now.name}»`;
    const emoji = now.emoji || '🎯';

    // 1. Meta cubierta. Es la mejor noticia posible y se dice sola.
    if (now.remaining <= 0 && was.remaining > 0) {
      out.push({
        id: `done-${now.goalId}`,
        tone: 'good',
        message: `${emoji} ¡${nombre} ya está cubierta!`,
        weight: 100,
      });
      continue;
    }

    // 2. Cambió de estado: dejó de llegar a tiempo, o volvió a llegar. Es más
    //    importante que cualquier número porque cambia la respuesta a "¿lo
    //    voy a lograr?".
    if (isBad(now.feasibility) && !isBad(was.feasibility)) {
      out.push({
        id: `at-risk-${now.goalId}`,
        tone: 'warning',
        message: now.shortfallMonthly > 0
          ? `${emoji} ${nombre} ya no llega a tiempo: le faltan ${money(now.shortfallMonthly)} al mes.`
          : `${emoji} ${nombre} ya no llega a tiempo.`,
        weight: 90,
      });
      continue;
    }
    if (!isBad(now.feasibility) && isBad(was.feasibility)) {
      out.push({
        id: `recovered-${now.goalId}`,
        tone: 'good',
        message: `${emoji} ${nombre} vuelve a llegar a tiempo.`,
        weight: 80,
      });
      continue;
    }

    // 3. Se movió la fecha estimada. Es la traducción honesta de casi todo:
    //    un gasto la empuja, un ingreso o un aporte la adelantan.
    if (was.projectedDate && now.projectedDate) {
      const shift = monthsBetween(was.projectedDate, now.projectedDate);
      if (shift <= -1) {
        out.push({
          id: `earlier-${now.goalId}`,
          tone: 'good',
          message: `${emoji} ${nombre} se adelanta ${meses(Math.abs(shift))}.`,
          weight: 70 + Math.min(10, Math.abs(shift)),
        });
      } else if (shift >= 1) {
        out.push({
          id: `later-${now.goalId}`,
          tone: 'warning',
          message: `${emoji} ${nombre} se retrasa ${meses(shift)}.`,
          weight: 75 + Math.min(10, shift),
        });
      }
      continue;
    }

    // 4. Una meta que no tenía ritmo y ahora sí: pasa de "algún día" a tener
    //    fecha, y eso el usuario quiere saberlo.
    if (!was.projectedDate && now.projectedDate && now.allocatedMonthly > 0) {
      out.push({
        id: `started-${now.goalId}`,
        tone: 'good',
        message: `${emoji} ${nombre} ya tiene ritmo: ${money(now.allocatedMonthly)} al mes.`,
        weight: 60,
      });
    }
  }

  // 5. Si ninguna meta se movió, el dinero libre del mes es lo único que hay
  //    que contar: es el aviso de "esto entró, esto salió".
  if (out.length === 0) {
    const delta = after.cashFlow.available - before.cashFlow.available;
    if (Math.abs(delta) >= MIN_MONEY_DELTA) {
      out.push({
        id: 'free-money',
        tone: delta > 0 ? 'good' : 'info',
        message: delta > 0
          ? `💰 Tu mes queda ${money(delta)} más holgado.`
          : `📉 Te quedan ${money(Math.abs(delta))} menos libres este mes.`,
        weight: 10,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Lo único que merece interrumpir al usuario. null = no decir nada. */
export function topPlanChange(before: PlanSnapshot, after: PlanSnapshot): PlanChange | null {
  return diffPlans(before, after)[0] ?? null;
}
