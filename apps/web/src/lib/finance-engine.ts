/**
 * finance-engine.ts — el cerebro del Plan Financiero.
 *
 * Funciones PURAS (sin SQL, sin fechas implícitas fuera de `now`) que toman una
 * foto de la situación del usuario — ingresos, pagos fijos, gasto de super y
 * metas — y devuelven un plan: cuánto queda libre cada mes, cuánto hay que
 * apartar por meta, si la fecha objetivo es alcanzable y qué consejos concretos
 * dar para lograrlo.
 *
 * Todo el dinero se maneja en la moneda del usuario (USD por defecto) y se
 * redondea a 2 decimales solo al salir, para no arrastrar error de flotante.
 *
 * Se prueba en finance-engine.test.ts; la capa de datos vive en finance-data.ts.
 */

import { expenseKindMeta } from './expense-kind';
import type { BaselineSource, GroceryInsight } from './grocery-insights';
import type { OtherSpendInsight } from './other-spend';
import {
  buildBusinessResult,
  normalizeShare,
  splitAmount,
  type BusinessResult,
} from './expense-scope';

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type GoalKind = 'trip' | 'debt' | 'project' | 'purchase' | 'emergency';
export type GoalStatus = 'active' | 'paused' | 'done';
export type IncomeFrequency = 'monthly' | 'biweekly' | 'weekly' | 'yearly' | 'one_time';

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  isActive: boolean;
  note: string | null;
  /**
   * 0-100: qué parte de este ingreso es facturación del negocio.
   *
   * Existe porque separar los GASTOS sin separar los INGRESOS dejaría un
   * negocio que solo pierde dinero. Ver expense-scope.ts.
   */
  businessShare?: number;
}

export interface FinanceGoal {
  id: string;
  name: string;
  emoji: string;
  kind: GoalKind;
  targetAmount: number;
  savedAmount: number;
  /** YYYY-MM-DD o null si es una meta sin fecha límite. */
  targetDate: string | null;
  /** 1 = máxima prioridad, 2 = normal, 3 = cuando se pueda. */
  priority: number;
  /** Aporte mensual fijado a mano por el usuario (manda sobre el calculado). */
  monthlyOverride: number | null;
  status: GoalStatus;
  note: string | null;
  createdAt: string;
}

/** Un pago mensual recurrente ya registrado en la sección Pagos. */
export interface FixedPaymentInput {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  isPaidThisMonth: boolean;
  missedMonths: number;
  accumulatedDebt: number;
  /** 0-100: qué parte de este pago corresponde al negocio. */
  businessShare?: number;
}

/**
 * Una línea de crédito de la sección Deudas y Créditos: tarjeta, préstamo,
 * hipoteca.
 *
 * NO confundir con las otras dos "deudas" que ya maneja el plan:
 * - `FixedPaymentInput` es un recibo recurrente (renta, internet).
 * - `DebtOverview.overdueTotal` son meses de un recibo sin registrar.
 *
 * Lo que distingue a un crédito es que su SALDO GENERA INTERÉS cada mes, así
 * que su cuota es un compromiso mensual real que hay que restar del dinero
 * libre, y su interés es dinero que se evapora sin comprar nada.
 */
export interface CreditInput {
  id: string;
  name: string;
  balance: number;
  /** Cuota mensual según la estrategia elegida por el usuario. */
  installment: number;
  /** Lo que ese saldo cuesta al mes solo en intereses. */
  monthlyInterest: number;
  monthsToPayoff: number | null;
  /** La cuota no cubre el interés: el saldo nunca baja. */
  neverPaysOff: boolean;
  /** 0-100: qué parte de la cuota corresponde al negocio. */
  businessShare?: number;
}

export interface PlanInput {
  incomes: readonly IncomeSource[];
  goals: readonly FinanceGoal[];
  fixedPayments: readonly FixedPaymentInput[];
  /** Tarjetas y créditos de la sección Deudas y Créditos. */
  credits?: readonly CreditInput[];
  /**
   * Estimado mensual de super que resta el plan. Sale de las compras reales
   * (`groceries.baseline`); solo cae al límite del presupuesto cuando todavía
   * no hay tickets registrados.
   */
  groceriesMonthly: number;
  groceriesSource: BaselineSource;
  groceriesSpentThisMonth: number;
  /**
   * 0-100: qué parte del super es del negocio, ponderada por el importe de
   * cada compra del mes. Un solo número basta porque el plan resta el super
   * como un bloque, no compra a compra.
   */
  groceriesBusinessShare?: number;
  /** Análisis de las compras registradas — alimenta los consejos de super. */
  groceries?: GroceryInsight;
  /**
   * Estimado mensual del gasto que NO es super: comer fuera, farmacia,
   * gasolina, hogar.
   *
   * Sale de los mismos tickets, solo que clasificados. Antes no se restaba en
   * ninguna parte: el plan repartía entre metas un dinero que ya se había
   * gastado, y las metas fallaban sin que nada en la pantalla lo explicara.
   */
  otherExpensesMonthly?: number;
  /** 0-100: qué parte de esos gastos es del negocio, ponderada por importe. */
  otherBusinessShare?: number;
  /** Desglose de ese gasto — alimenta sus consejos. */
  otherSpend?: OtherSpendInsight;
  /** Dinero extra mensual para simular escenarios ("¿y si aporto $200 más?"). */
  extraMonthly?: number;
  now?: Date;
}

// ─── Tipos de salida ──────────────────────────────────────────────────────────

export interface CashFlow {
  monthlyIncome: number;
  fixedPayments: number;
  groceriesEstimate: number;
  /** Comer fuera, farmacia, gasolina, hogar: los tickets que no son de super. */
  otherExpenses: number;
  /** Suma de las cuotas de tarjetas y créditos — compromiso mensual real. */
  creditPayments: number;
  /** Ingreso − pagos fijos − super − otros gastos − cuotas (+ extra simulado). Puede ser negativo. */
  available: number;
  /** Parte de `available` que el plan reserva para ponerse al día con deudas. */
  debtCatchUp: number;
  /** Lo que queda para metas después de la reserva de deuda. */
  goalsBudget: number;
  /** Suma efectivamente asignada a metas. */
  allocatedToGoals: number;
  /** Colchón que sobra tras cubrir metas. */
  unallocated: number;
  /** available / ingreso, 0–1. 0 si no hay ingreso registrado. */
  savingsRate: number;
  extraMonthly: number;
}

export type Feasibility =
  | 'done'        // ya se juntó el objetivo
  | 'on_track'    // el ritmo asignado alcanza con holgura
  | 'tight'       // alcanza, pero exige casi todo lo disponible
  | 'at_risk'     // el ritmo asignado NO alcanza para la fecha
  | 'overdue'     // la fecha ya pasó y falta dinero
  | 'no_date';    // sin fecha límite

export interface GoalProjection {
  goalId: string;
  name: string;
  emoji: string;
  kind: GoalKind;
  priority: number;
  targetAmount: number;
  savedAmount: number;
  remaining: number;
  percentComplete: number;
  targetDate: string | null;
  daysLeft: number | null;
  monthsLeft: number | null;
  /** Lo que habría que apartar cada mes para llegar a tiempo. */
  requiredMonthly: number;
  requiredWeekly: number;
  requiredDaily: number;
  /** Lo que el plan puede asignarle realmente este mes. */
  allocatedMonthly: number;
  /** requiredMonthly − allocatedMonthly (0 si alcanza). */
  shortfallMonthly: number;
  /** Fecha estimada de logro al ritmo asignado (YYYY-MM-DD) o null. */
  projectedDate: string | null;
  /** Meses de retraso frente a la fecha objetivo al ritmo actual. */
  monthsLate: number;
  feasibility: Feasibility;
  status: GoalStatus;
}

export interface DebtOverview {
  /** Deuda acumulada de pagos vencidos sin registrar. */
  overdueTotal: number;
  overdueCount: number;
  /** Pagos atrasados, el de menor deuda primero (método bola de nieve). */
  payoffOrder: { id: string; name: string; debt: number; missedMonths: number }[];
  monthlyCatchUp: number;
  monthsToClear: number | null;
  /** Metas de tipo deuda registradas a mano. */
  goalDebtTotal: number;
  /** Saldo total de tarjetas y créditos (el que genera interés). */
  creditBalance: number;
  /** Lo que esos créditos cuestan cada mes solo en intereses. */
  creditMonthlyInterest: number;
  /** Suma de sus cuotas mensuales. */
  creditPayments: number;
  /** Créditos ordenados por lo que cuestan al mes — el más caro primero. */
  creditOrder: {
    id: string;
    name: string;
    balance: number;
    installment: number;
    monthlyInterest: number;
    monthsToPayoff: number | null;
    neverPaysOff: boolean;
  }[];
  /** Créditos que con su cuota actual no se liquidan nunca. */
  creditsStuck: { id: string; name: string; monthlyInterest: number }[];
}

export type AdviceTone = 'critical' | 'warning' | 'good' | 'idea' | 'info';

export interface AdviceAction {
  label: string;
  kind: 'add_income' | 'add_goal' | 'open_payments' | 'open_budget' | 'open_trips' | 'open_debts' | 'edit_goal' | 'contribute';
  goalId?: string;
}

export interface Advice {
  id: string;
  tone: AdviceTone;
  icon: string;
  title: string;
  body: string;
  /**
   * Qué se puede hacer, una cosa por línea.
   *
   * Va aparte del cuerpo porque antes las opciones se metían en la misma frase
   * separadas por punto y coma —«Opciones: bajar la meta a $0; sumar $1.074 de
   * ingreso extra»— y con dos o tres se volvía ilegible justo en el momento en
   * que el usuario buscaba qué hacer.
   */
  steps?: string[];
  action?: AdviceAction;
}

/** Un lado del reparto: lo que entra y lo que sale de ese ámbito. */
export interface ScopeSide {
  income: number;
  fixedPayments: number;
  creditPayments: number;
  groceries: number;
  /** Comida fuera, farmacia, gasolina, hogar. */
  otherExpenses: number;
  /** Todo lo que sale de este lado. */
  expenses: number;
}

/**
 * El mismo mes visto por partida doble: qué es tuyo y qué es del negocio.
 *
 * Es ADITIVO: no altera `cashFlow.available`, que sigue siendo el total real.
 * Para quien factura por su cuenta todo sale del mismo bolsillo, y cambiar el
 * significado de «te queda libre» a espaldas del usuario sería peor que no
 * separar nada. Esto responde a otra pregunta —*¿cuánto me cuesta el negocio y
 * cuánto rinde?*— sin tocar la primera.
 */
export interface ScopeBreakdown {
  personal: ScopeSide;
  business: ScopeSide;
  /** Ingresos del negocio − gastos del negocio. */
  businessResult: BusinessResult;
  /** Hay algo marcado como negocio: sin esto la sección ni se muestra. */
  hasBusiness: boolean;
}

export interface FinancePlan {
  cashFlow: CashFlow;
  goals: GoalProjection[];
  debts: DebtOverview;
  /** Reparto personal / negocio del mismo mes. */
  scopes: ScopeBreakdown;
  advice: Advice[];
  /** Salud general 0–100: mezcla de flujo libre, deuda y metas en riesgo. */
  healthScore: number;
  currency: string;
  generatedAt: string;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export const MS_PER_DAY = 86_400_000;
/** Promedio real de días por mes (365.25 / 12) — evita el sesgo de usar 30. */
export const DAYS_PER_MONTH = 30.4375;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** "2026-10-15" → Date local al final de ese día (la meta vale todo el día). */
export function parseTargetDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Días completos que faltan para la fecha (0 = es hoy, negativo = ya pasó). */
export function daysUntil(target: string, now: Date = new Date()): number | null {
  const end = parseTargetDate(target);
  if (!end) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((end.getTime() - startOfToday) / MS_PER_DAY - 0.5);
}

/** Ingreso mensual equivalente de una fuente según su frecuencia. */
export function monthlyEquivalent(amount: number, frequency: IncomeFrequency): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (frequency) {
    case 'weekly':   return (amount * 52) / 12;
    case 'biweekly': return (amount * 26) / 12;
    case 'yearly':   return amount / 12;
    case 'one_time': return 0;
    case 'monthly':
    default:         return amount;
  }
}

export function totalMonthlyIncome(incomes: readonly IncomeSource[]): number {
  return incomes
    .filter((i) => i.isActive)
    .reduce((sum, i) => sum + monthlyEquivalent(i.amount, i.frequency), 0);
}

/** Meses (redondeando hacia arriba) para juntar `remaining` aportando `monthly`. */
export function monthsToReach(remaining: number, monthly: number): number | null {
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}

/** Suma `months` meses a `from`, sin desbordar a otro mes por días 29–31. */
export function addMonths(from: Date, months: number): Date {
  const day = from.getDate();
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

// ─── Motor ────────────────────────────────────────────────────────────────────

/** Orden de atención: prioridad, luego la fecha más cercana, luego lo más chico. */
function compareGoals(a: GoalProjection, b: GoalProjection): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const aDays = a.daysLeft ?? Number.POSITIVE_INFINITY;
  const bDays = b.daysLeft ?? Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return aDays - bDays;
  return a.remaining - b.remaining;
}

/** Horizonte por defecto (meses) para metas sin fecha límite. */
const DEFAULT_HORIZON_MONTHS = 12;

function projectGoal(goal: FinanceGoal, now: Date): GoalProjection {
  const targetAmount = Math.max(0, goal.targetAmount);
  const savedAmount = clamp(goal.savedAmount, 0, Number.MAX_SAFE_INTEGER);
  const remaining = Math.max(0, targetAmount - savedAmount);
  const percentComplete = targetAmount > 0 ? clamp((savedAmount / targetAmount) * 100, 0, 100) : 0;

  const days = goal.targetDate ? daysUntil(goal.targetDate, now) : null;
  const daysLeft = days === null ? null : days;
  const monthsLeft = daysLeft === null ? null : daysLeft / DAYS_PER_MONTH;

  // Con fecha: reparte lo que falta en el tiempo que queda. Sin fecha: horizonte
  // de un año para que la meta siga teniendo un ritmo sugerido concreto.
  let requiredMonthly: number;
  if (remaining === 0) {
    requiredMonthly = 0;
  } else if (monthsLeft === null) {
    requiredMonthly = remaining / DEFAULT_HORIZON_MONTHS;
  } else if (monthsLeft <= 0) {
    requiredMonthly = remaining; // la fecha ya pasó: hace falta todo, ya
  } else {
    requiredMonthly = remaining / monthsLeft;
  }

  const effectiveDays = daysLeft !== null && daysLeft > 0 ? daysLeft : null;

  return {
    goalId: goal.id,
    name: goal.name,
    emoji: goal.emoji,
    kind: goal.kind,
    priority: goal.priority,
    targetAmount: round2(targetAmount),
    savedAmount: round2(savedAmount),
    remaining: round2(remaining),
    percentComplete: round2(percentComplete),
    targetDate: goal.targetDate,
    daysLeft,
    monthsLeft: monthsLeft === null ? null : round2(monthsLeft),
    requiredMonthly: round2(requiredMonthly),
    requiredWeekly: round2(effectiveDays ? (remaining / effectiveDays) * 7 : requiredMonthly / 4.345),
    requiredDaily: round2(effectiveDays ? remaining / effectiveDays : requiredMonthly / DAYS_PER_MONTH),
    allocatedMonthly: 0,
    shortfallMonthly: 0,
    projectedDate: null,
    monthsLate: 0,
    feasibility: 'no_date',
    status: goal.status,
  };
}

/** Reparte `goalsBudget` entre las metas activas por orden de atención. */
function allocate(projections: GoalProjection[], goalsBudget: number, overrides: Map<string, number | null>): number {
  let pool = Math.max(0, goalsBudget);
  for (const p of projections) {
    if (p.status !== 'active' || p.remaining <= 0) continue;
    const override = overrides.get(p.goalId);
    const want = override != null && override > 0 ? override : p.requiredMonthly;
    const alloc = Math.min(want, pool);
    p.allocatedMonthly = round2(alloc);
    pool = round2(pool - alloc);
  }
  return pool;
}

/** A partir de aquí una meta se considera "justa": se come casi todo el margen. */
const TIGHT_RATIO = 0.85;

function finishProjection(p: GoalProjection, now: Date, goalsBudget: number): void {
  p.shortfallMonthly = round2(Math.max(0, p.requiredMonthly - p.allocatedMonthly));

  const months = monthsToReach(p.remaining, p.allocatedMonthly);
  p.projectedDate = months === null ? null : toDateKey(addMonths(now, months));

  if (p.remaining <= 0) {
    p.feasibility = 'done';
    p.monthsLate = 0;
    return;
  }
  if (p.targetDate === null) {
    p.feasibility = 'no_date';
    return;
  }
  if ((p.daysLeft ?? 0) <= 0) {
    p.feasibility = 'overdue';
    return;
  }
  if (months !== null && p.monthsLeft !== null) {
    p.monthsLate = round2(Math.max(0, months - Math.ceil(p.monthsLeft)));
  } else {
    p.monthsLate = 0;
  }
  if (p.allocatedMonthly + 0.01 >= p.requiredMonthly) {
    // Alcanza; "justa" si esa cuota se lleva casi todo el dinero libre del mes,
    // porque entonces cualquier imprevisto la descarrila.
    const share = goalsBudget > 0 ? p.requiredMonthly / goalsBudget : 1;
    p.feasibility = share > TIGHT_RATIO ? 'tight' : 'on_track';
  } else {
    p.feasibility = 'at_risk';
  }
}

function buildDebtOverview(
  fixedPayments: readonly FixedPaymentInput[],
  goals: readonly FinanceGoal[],
  credits: readonly CreditInput[],
  available: number,
): DebtOverview {
  const overdue = fixedPayments.filter((p) => p.accumulatedDebt > 0);
  const overdueTotal = round2(overdue.reduce((s, p) => s + p.accumulatedDebt, 0));

  // Bola de nieve: primero la deuda más pequeña — se liquida rápido y el
  // impulso de tacharla es lo que sostiene el plan.
  const payoffOrder = [...overdue]
    .sort((a, b) => a.accumulatedDebt - b.accumulatedDebt)
    .map((p) => ({ id: p.id, name: p.name, debt: round2(p.accumulatedDebt), missedMonths: p.missedMonths }));

  // Ponerse al día en ~3 meses sin canibalizar más del 40% del dinero libre.
  const ideal = overdueTotal / 3;
  const cap = Math.max(0, available) * 0.4;
  const monthlyCatchUp = overdueTotal > 0 ? round2(Math.min(ideal, cap)) : 0;
  const monthsToClear = monthlyCatchUp > 0 ? Math.ceil(overdueTotal / monthlyCatchUp) : null;

  const goalDebtTotal = round2(
    goals
      .filter((g) => g.kind === 'debt' && g.status === 'active')
      .reduce((s, g) => s + Math.max(0, g.targetAmount - g.savedAmount), 0),
  );

  // Los créditos se ordenan por lo que CUESTAN al mes, no por saldo: una
  // tarjeta chica al 8 % puede sangrar más que una hipoteca grande al 0.5 %.
  const creditOrder = [...credits]
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.monthlyInterest - a.monthlyInterest || b.balance - a.balance)
    .map((c) => ({
      id: c.id,
      name: c.name,
      balance: round2(c.balance),
      installment: round2(c.installment),
      monthlyInterest: round2(c.monthlyInterest),
      monthsToPayoff: c.monthsToPayoff,
      neverPaysOff: c.neverPaysOff,
    }));

  return {
    overdueTotal,
    overdueCount: overdue.length,
    payoffOrder,
    monthlyCatchUp,
    monthsToClear,
    goalDebtTotal,
    creditBalance: round2(creditOrder.reduce((s, c) => s + c.balance, 0)),
    creditMonthlyInterest: round2(creditOrder.reduce((s, c) => s + c.monthlyInterest, 0)),
    creditPayments: round2(creditOrder.reduce((s, c) => s + c.installment, 0)),
    creditOrder,
    creditsStuck: creditOrder
      .filter((c) => c.neverPaysOff)
      .map((c) => ({ id: c.id, name: c.name, monthlyInterest: c.monthlyInterest })),
  };
}

/**
 * Reparte ingresos, pagos fijos y cuotas de crédito entre lo personal y lo del
 * negocio, cada cosa por su propio porcentaje.
 *
 * El super se reparte con el porcentaje ponderado de las compras del mes: quien
 * marca sus compras de insumos como del negocio ve ese gasto donde corresponde.
 * Sin nada marcado el porcentaje es 0 y el super va entero a personal, que es el
 * comportamiento de siempre.
 */
function buildScopeBreakdown(input: PlanInput, groceries: number, otherExpenses: number): ScopeBreakdown {
  const grocerySplit = splitAmount(groceries, normalizeShare(input.groceriesBusinessShare));
  // Los gastos que no son super se reparten con su propio porcentaje: la
  // gasolina de los repartos y la comida del sábado no son lo mismo.
  const otherSplit = splitAmount(otherExpenses, normalizeShare(input.otherBusinessShare));
  const personal: ScopeSide = {
    income: 0, fixedPayments: 0, creditPayments: 0,
    groceries: grocerySplit.personal, otherExpenses: otherSplit.personal, expenses: 0,
  };
  const business: ScopeSide = {
    income: 0, fixedPayments: 0, creditPayments: 0,
    groceries: grocerySplit.business, otherExpenses: otherSplit.business, expenses: 0,
  };
  let anyBusiness = grocerySplit.business > 0 || otherSplit.business > 0;

  for (const inc of input.incomes) {
    if (!inc.isActive) continue;
    const share = normalizeShare(inc.businessShare);
    if (share > 0) anyBusiness = true;
    const split = splitAmount(monthlyEquivalent(inc.amount, inc.frequency), share);
    personal.income += split.personal;
    business.income += split.business;
  }

  for (const p of input.fixedPayments) {
    const share = normalizeShare(p.businessShare);
    if (share > 0) anyBusiness = true;
    const split = splitAmount(Math.max(0, p.amount), share);
    personal.fixedPayments += split.personal;
    business.fixedPayments += split.business;
  }

  for (const c of input.credits ?? []) {
    const share = normalizeShare(c.businessShare);
    if (share > 0) anyBusiness = true;
    const split = splitAmount(Math.max(0, c.installment), share);
    personal.creditPayments += split.personal;
    business.creditPayments += split.business;
  }

  const close = (side: ScopeSide): ScopeSide => ({
    income: round2(side.income),
    fixedPayments: round2(side.fixedPayments),
    creditPayments: round2(side.creditPayments),
    groceries: round2(side.groceries),
    otherExpenses: round2(side.otherExpenses),
    expenses: round2(side.fixedPayments + side.creditPayments + side.groceries + side.otherExpenses),
  });

  const personalSide = close(personal);
  const businessSide = close(business);

  return {
    personal: personalSide,
    business: businessSide,
    businessResult: buildBusinessResult(businessSide.income, businessSide.expenses),
    hasBusiness: anyBusiness,
  };
}

/**
 * La misma foto del mes, pero SOLO con la parte personal de cada cosa.
 *
 * Sirve para responder «¿me alcanza para esta meta sin contar con el negocio?».
 * Quien factura por su cuenta puede querer las dos respuestas: una si piensa
 * financiar la meta con dinero del negocio y otra si no, y ninguna es más
 * correcta que la otra — depende de una decisión que solo el usuario puede
 * tomar.
 *
 * Se reparten ingresos, pagos fijos y cuotas; el super se queda entero porque
 * nunca tuvo ámbito. Las metas y el resto de la foto no se tocan.
 */
export function personalOnlyInput(input: PlanInput): PlanInput {
  return {
    ...input,
    incomes: input.incomes.map((i) => ({
      ...i,
      // El importe se reparte en su propia frecuencia: como el paso a mensual
      // es lineal, repartir antes o después da lo mismo.
      amount: splitAmount(i.amount, normalizeShare(i.businessShare)).personal,
      businessShare: 0,
    })),
    fixedPayments: input.fixedPayments.map((p) => ({
      ...p,
      amount: splitAmount(p.amount, normalizeShare(p.businessShare)).personal,
      businessShare: 0,
    })),
    credits: (input.credits ?? []).map((c) => ({
      ...c,
      installment: splitAmount(c.installment, normalizeShare(c.businessShare)).personal,
      businessShare: 0,
    })),
    // El super también: si parte de la compra era del negocio, esa parte sale
    // del plan personal igual que un pago fijo del negocio.
    groceriesMonthly: splitAmount(
      input.groceriesMonthly,
      normalizeShare(input.groceriesBusinessShare),
    ).personal,
    groceriesBusinessShare: 0,
    // Y lo mismo con el resto de gastos: la gasolina de los repartos sale del
    // plan personal igual que un pago fijo del negocio.
    otherExpensesMonthly: splitAmount(
      input.otherExpensesMonthly ?? 0,
      normalizeShare(input.otherBusinessShare),
    ).personal,
    otherBusinessShare: 0,
  };
}

/**
 * Salud financiera 0–100. Tres tercios: flujo libre sobre el ingreso, ausencia
 * de deuda vencida y metas que van a tiempo.
 */
function computeHealthScore(cash: CashFlow, goals: GoalProjection[], debts: DebtOverview): number {
  if (cash.monthlyIncome <= 0) return 0;

  const flowScore = clamp(cash.savingsRate / 0.2, 0, 1) * 40; // 20% de ahorro = pleno
  const debtScore = debts.overdueTotal <= 0
    ? 30
    : clamp(1 - debts.overdueTotal / Math.max(cash.monthlyIncome, 1), 0, 1) * 30;

  const tracked = goals.filter((g) => g.status === 'active' && g.remaining > 0);
  const healthyGoals = tracked.filter((g) => g.feasibility === 'on_track' || g.feasibility === 'tight').length;
  const goalScore = tracked.length === 0 ? 30 : (healthyGoals / tracked.length) * 30;

  return Math.round(clamp(flowScore + debtScore + goalScore, 0, 100));
}

// ─── Consejos ─────────────────────────────────────────────────────────────────

const TONE_WEIGHT: Record<AdviceTone, number> = { critical: 0, warning: 1, idea: 2, good: 3, info: 4 };

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.round(n),
  );

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function prettyDate(key: string): string {
  const d = parseTargetDate(key);
  if (!d) return key;
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function adviceForCashFlow(cash: CashFlow, out: Advice[]): void {
  // Sin ingresos no se emite consejo: la cabecera ya pide lo mismo con su botón
  // «Ingresos», que se vuelve la acción principal justo en este caso. Un consejo
  // aquí pedía el dato por segunda vez, con instrucciones, a media pantalla de
  // distancia del botón que de verdad lo resuelve. Mismo criterio que con las
  // metas más abajo.
  //
  // El corte SÍ se queda: sin ingreso, «gastas de más» y «te queda poco libre»
  // saldrían de dividir entre cero y solo confundirían.
  if (cash.monthlyIncome <= 0) return;

  if (cash.available < 0) {
    const deficit = Math.abs(cash.available);
    out.push({
      id: 'negative-flow',
      tone: 'critical',
      icon: '🚨',
      title: `Gastas ${money(deficit)} más de lo que ingresas`,
      body: `Tus pagos fijos (${money(cash.fixedPayments)})${cash.creditPayments > 0 ? `, las cuotas de tus créditos (${money(cash.creditPayments)})` : ''}${cash.otherExpenses > 0 ? `, lo que gastas fuera del super (${money(cash.otherExpenses)})` : ''} más el super (${money(cash.groceriesEstimate)}) superan tu ingreso mensual de ${money(cash.monthlyIncome)}. Antes de ahorrar para cualquier meta hay que cerrar ese hueco: revisa qué pago fijo puedes bajar o cancelar, y recorta el super.`,
      action: { label: 'Revisar pagos fijos', kind: 'open_payments' },
    });
    return;
  }

  if (cash.savingsRate < 0.1) {
    out.push({
      id: 'low-savings-rate',
      tone: 'warning',
      icon: '📉',
      title: `Solo te queda libre el ${Math.round(cash.savingsRate * 100)}% de tu ingreso`,
      body: `Después de pagos fijos y super te sobran ${money(cash.available)} al mes. Lo sano es 20% (${money(cash.monthlyIncome * 0.2)}). Bajar el super un 15% te daría ${money(cash.groceriesEstimate * 0.15)} extra cada mes.`,
      action: { label: 'Ajustar presupuesto', kind: 'open_budget' },
    });
  } else if (cash.savingsRate >= 0.2) {
    out.push({
      id: 'healthy-savings-rate',
      tone: 'good',
      icon: '🌱',
      title: `Tu tasa de ahorro es del ${Math.round(cash.savingsRate * 100)}%`,
      body: `Te quedan ${money(cash.available)} libres cada mes — por encima del 20% recomendado. Ese margen es justo lo que hace que tus metas lleguen a tiempo.`,
    });
  }
}

/**
 * Consejos sobre tarjetas y créditos.
 *
 * El interés es el único gasto del plan que no compra nada: se va en mantener
 * viva una deuda. Por eso se nombra en dinero al mes y al año — «te cuesta $90
 * al mes» pesa mucho más que «tienes un 3 % mensual».
 */
function adviceForCredits(debts: DebtOverview, out: Advice[]): void {
  if (debts.creditBalance <= 0) return;

  if (debts.creditsStuck.length > 0) {
    const names = debts.creditsStuck.map((c) => c.name).join(', ');
    out.push({
      id: 'credits-stuck',
      tone: 'critical',
      icon: '🛑',
      title:
        debts.creditsStuck.length === 1
          ? `${debts.creditsStuck[0].name} no se termina de pagar nunca`
          : `${debts.creditsStuck.length} créditos no se terminan de pagar nunca`,
      body: `Con la cuota actual, ${names} solo cubre${debts.creditsStuck.length === 1 ? '' : 'n'} intereses: el saldo no baja. Subir un poco la cuota es lo único que cambia eso.`,
      action: { label: 'Ver mis deudas', kind: 'open_debts' },
    });
  }

  if (debts.creditMonthlyInterest > 0) {
    const worst = debts.creditOrder[0];
    out.push({
      id: 'credit-interest',
      tone: debts.creditMonthlyInterest >= 50 ? 'warning' : 'info',
      icon: '📈',
      title: `Tus créditos te cuestan ${money(debts.creditMonthlyInterest)} al mes en intereses`,
      body: `Son ${money(debts.creditMonthlyInterest * 12)} al año que no compran nada. La más cara es ${worst.name}: ${money(worst.monthlyInterest)} al mes sobre un saldo de ${money(worst.balance)}. Abonar de más ahí rinde más que en cualquier meta.`,
      action: { label: 'Ver mis deudas', kind: 'open_debts' },
    });
  }
}

/**
 * Consejos sobre el negocio. Solo aparecen si hay algo marcado como negocio —
 * quien no lo use no se entera de que esto existe.
 */
function adviceForScopes(scopes: ScopeBreakdown, out: Advice[]): void {
  if (!scopes.hasBusiness) return;
  const r = scopes.businessResult;

  if (r.expensesWithoutIncome) {
    out.push({
      id: 'business-no-income',
      tone: 'warning',
      icon: '🏢',
      title: `Tu negocio gasta ${money(r.expenses)} al mes y no tiene ingresos declarados`,
      body: 'Sin la facturación cargada, ese gasto sale entero de tu bolsillo en el plan. Agrega el ingreso del negocio y marca qué parte es suya para ver el resultado real.',
      action: { label: 'Agregar ingreso', kind: 'add_income' },
    });
    return;
  }

  if (r.result < 0) {
    out.push({
      id: 'business-loss',
      tone: 'critical',
      icon: '📉',
      title: `Tu negocio pierde ${money(Math.abs(r.result))} al mes`,
      body: `Factura ${money(r.income)} y gasta ${money(r.expenses)}. Esa diferencia la estás cubriendo con tu dinero personal todos los meses.`,
    });
  } else if (r.income > 0) {
    out.push({
      id: 'business-result',
      tone: 'good',
      icon: '🏢',
      title: `Tu negocio deja ${money(r.result)} al mes`,
      body: `Factura ${money(r.income)} y gasta ${money(r.expenses)} — un margen del ${r.margin.toFixed(0)} %.`,
    });
  }
}

function adviceForDebt(cash: CashFlow, debts: DebtOverview, out: Advice[]): void {
  if (debts.overdueTotal <= 0) return;

  const first = debts.payoffOrder[0];
  const plan = debts.monthsToClear
    ? `Con ${money(debts.monthlyCatchUp)} al mes lo liquidas en ${debts.monthsToClear} ${debts.monthsToClear === 1 ? 'mes' : 'meses'}.`
    : 'No queda dinero libre para abonarlo: primero hay que liberar flujo bajando gastos.';

  out.push({
    id: 'overdue-debt',
    tone: 'critical',
    icon: '🔴',
    title: `Tienes ${money(debts.overdueTotal)} en pagos atrasados`,
    body: `${debts.overdueCount} ${debts.overdueCount === 1 ? 'pago acumula meses' : 'pagos acumulan meses'} sin registrar. Esto va antes que cualquier meta: los atrasos suelen generar recargos e intereses que ninguna meta compensa. ${plan}`,
    action: { label: 'Ver pagos', kind: 'open_payments' },
  });

  if (first && debts.payoffOrder.length > 1) {
    const order = debts.payoffOrder.map((d) => `${d.name} (${money(d.debt)})`).join(' → ');
    out.push({
      id: 'snowball-order',
      tone: 'idea',
      icon: '❄️',
      title: 'Orden sugerido: bola de nieve',
      body: `Ataca primero la deuda más pequeña y sigue en orden: ${order}. Cada una que tachas libera su cuota mensual y acelera la siguiente. Empieza por ${first.name}: son ${money(first.debt)}.`,
      action: { label: 'Ver pagos', kind: 'open_payments' },
    });
  }

  if (cash.goalsBudget <= 0 && cash.available > 0) {
    out.push({
      id: 'debt-eats-budget',
      tone: 'warning',
      icon: '⏸️',
      title: 'Tus metas están en pausa mientras pagas atrasos',
      body: `Todo el dinero libre (${money(cash.available)}) se está yendo a ponerte al día. Es lo correcto por ahora — en cuanto liquides los atrasos ese monto pasa entero a tus metas.`,
    });
  }
}

/**
 * Una meta que no llega a tiempo. Es el consejo que más se lee, y era el peor
 * escrito de todos.
 *
 * Decía «Necesitas $1.074 al mes hasta el 15 de octubre y el plan solo puede
 * darle $0. Te faltan $1.074 cada mes. Opciones: bajar la meta a $0; sumar
 * $1.074 de ingreso extra al mes.» Tres veces la misma cifra, un «$0» sin
 * explicar de dónde salía, y una opción —bajar la meta a cero— que no significa
 * nada. El usuario no entendía qué le estaban diciendo, y con razón.
 *
 * Lo que hace falta no es más dato, es la CAUSA. Cuando el plan no puede
 * apartar nada, el problema casi nunca es la meta: es que no hay ingresos
 * cargados, que el mes está en números rojos, o que otra meta se lleva todo.
 * Son tres situaciones distintas, con tres arreglos distintos, y hay que
 * nombrarlas por su nombre en vez de resumirlas en un «$0».
 */
function adviceForGoalAtRisk(goal: GoalProjection, cash: CashFlow, input: PlanInput, out: Advice[]): void {
  const fecha = goal.targetDate ? prettyDate(goal.targetDate) : null;
  const hasta = fecha ? ` antes del ${fecha}` : '';
  const base = {
    id: `goal-risk-${goal.goalId}`,
    tone: 'warning' as const,
    icon: '⚠️',
  };

  // Sin ingresos cargados NINGUNA meta puede recibir nada, así que este consejo
  // saldría clonado tantas veces como metas haya, diciendo lo mismo. Lo cuenta
  // una sola tarjeta —`adviceForStalledGoals`— y aquí se calla.
  if (cash.monthlyIncome <= 0) return;

  // ── El mes no da: no queda dinero libre para ninguna meta ─────────────────
  if (cash.goalsBudget <= 0) {
    const salidas = cash.fixedPayments + cash.groceriesEstimate + cash.otherExpenses + cash.creditPayments;
    const steps: string[] = [];
    if (cash.fixedPayments > 0) {
      steps.push(`Tus pagos fijos se llevan ${money(cash.fixedPayments)} al mes: mira cuál puedes bajar o cancelar.`);
    }
    if (cash.creditPayments > 0) {
      steps.push(`Las cuotas de tus créditos son otros ${money(cash.creditPayments)}. Liquidar la más chica libera su cuota entera.`);
    }
    if (input.groceriesMonthly > 0) {
      steps.push(`El super va por ${money(input.groceriesMonthly)}: un 15 % menos son ${money(input.groceriesMonthly * 0.15)} al mes.`);
    }
    steps.push(`Mientras tanto puedes pausar la meta, para que deje de aparecer en riesgo.`);

    out.push({
      ...base,
      title: `${goal.name} está parada`,
      body: `No es un problema de esta meta, es del mes: entre lo que sale de tu cuenta (${money(salidas)}) y lo que entra (${money(cash.monthlyIncome)}) no queda nada libre, así que el plan no puede apartar ni un dólar para ninguna meta. Primero hay que abrir ese hueco.`,
      steps,
      action: { label: 'Revisar pagos fijos', kind: 'open_payments' },
    });
    return;
  }

  // ── Hay dinero libre, pero se lo llevan otras metas ───────────────────────
  if (goal.allocatedMonthly <= 0) {
    out.push({
      ...base,
      title: `${goal.name} no recibe nada este mes`,
      body: `Hay ${money(cash.goalsBudget)} libres al mes, pero tus otras metas se los reparten enteros antes de llegar a esta. El plan atiende primero las de mayor prioridad y fecha más cercana.`,
      steps: [
        `Súbele la prioridad si esta importa más que las de arriba.`,
        `O pausa una de las otras y su aporte pasa a esta.`,
        `Necesitaría ${money(goal.requiredMonthly)} al mes para llegar${hasta}.`,
      ],
      action: { label: 'Ajustar meta', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  // ── Recibe algo, pero no alcanza ──────────────────────────────────────────
  const falta = goal.shortfallMonthly;
  const steps: string[] = [];

  if (goal.projectedDate) {
    const tarde = goal.monthsLate > 0
      ? ` — unos ${goal.monthsLate} ${goal.monthsLate === 1 ? 'mes' : 'meses'} más tarde`
      : '';
    steps.push(`Mueve la fecha al ${prettyDate(goal.projectedDate)} y llegas sin cambiar nada más${tarde}.`);
  }

  const recorteSuper = input.groceriesMonthly > 0 ? falta / input.groceriesMonthly : 0;
  if (recorteSuper > 0 && recorteSuper <= 0.35) {
    steps.push(`Recorta el super un ${Math.ceil(recorteSuper * 100)} % y sale justo lo que falta.`);
  }

  // Bajar la meta solo se ofrece si el objetivo reducido es una cifra que
  // significa algo. Con $0 asignados salía «bájala a $0», que no es una opción.
  const alcanzable = goal.savedAmount + goal.allocatedMonthly * (goal.monthsLeft ?? 1);
  if (alcanzable > 0 && alcanzable < goal.targetAmount) {
    steps.push(`O baja el objetivo a ${money(alcanzable)}, que es lo que sí juntas para esa fecha.`);
  }

  steps.push(`Cualquier ingreso extra de ${money(falta)} al mes también la endereza.`);

  out.push({
    ...base,
    title: `${goal.name} no llega a tiempo`,
    body: `El plan le aparta ${money(goal.allocatedMonthly)} al mes, pero para juntar los ${money(goal.remaining)} que faltan${hasta} harían falta ${money(goal.requiredMonthly)}. Se queda corta por ${money(falta)} cada mes.`,
    steps,
    action: { label: 'Ajustar meta', kind: 'edit_goal', goalId: goal.goalId },
  });
}

function adviceForGoal(goal: GoalProjection, cash: CashFlow, input: PlanInput, out: Advice[]): void {
  const fecha = goal.targetDate ? prettyDate(goal.targetDate) : null;

  if (goal.feasibility === 'done') {
    out.push({
      id: `goal-done-${goal.goalId}`,
      tone: 'good',
      icon: '🎉',
      title: `¡${goal.name} está cubierta!`,
      body: `Ya tienes los ${money(goal.targetAmount)}. Marca la meta como lograda para liberar ${money(goal.allocatedMonthly || goal.requiredMonthly)} al mes hacia tus otras metas.`,
      action: { label: 'Marcar lograda', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'overdue') {
    out.push({
      id: `goal-overdue-${goal.goalId}`,
      tone: 'warning',
      icon: '📅',
      title: `${goal.name}: la fecha ya pasó`,
      // Sin ritmo asignado no se puede prometer una fecha: decir «al ritmo de
      // $0 la lograrías…» era una frase que se contradecía sola.
      body: goal.allocatedMonthly > 0 && goal.projectedDate
        ? `Llegó el ${fecha} y faltaron ${money(goal.remaining)}. Con los ${money(goal.allocatedMonthly)} que el plan le aparta cada mes, los tendrías hacia el ${prettyDate(goal.projectedDate)}: ponle esa fecha y vuelve a ir en camino.`
        : `Llegó el ${fecha} y faltaron ${money(goal.remaining)}. Ahora mismo el plan no puede apartarle nada, así que no hay fecha nueva que prometer hasta que liberes dinero del mes.`,
      action: { label: 'Ajustar fecha', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'at_risk') {
    adviceForGoalAtRisk(goal, cash, input, out);
    return;
  }

  if (goal.feasibility === 'tight') {
    out.push({
      id: `goal-tight-${goal.goalId}`,
      tone: 'idea',
      icon: '🎯',
      title: `${goal.name} va justa`,
      body: `Llegas al ${fecha}, pero se lleva casi todo tu margen (${money(goal.requiredMonthly)} de ${money(cash.goalsBudget)} disponibles). Cualquier gasto imprevisto la descarrila: intenta adelantar ${money(goal.requiredWeekly)} cada semana en vez de esperar al fin de mes.`,
      action: { label: 'Registrar aporte', kind: 'contribute', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'on_track' && goal.daysLeft !== null) {
    out.push({
      id: `goal-ok-${goal.goalId}`,
      tone: 'good',
      icon: goal.emoji || '✅',
      title: `${goal.name} va en camino`,
      body: `Apartando ${money(goal.requiredMonthly)} al mes — o ${money(goal.requiredWeekly)} por semana — tienes los ${money(goal.targetAmount)} para el ${fecha}. Faltan ${goal.daysLeft} días y llevas el ${Math.round(goal.percentComplete)}%.`,
      action: { label: 'Registrar aporte', kind: 'contribute', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'no_date') {
    out.push({
      id: `goal-nodate-${goal.goalId}`,
      tone: 'info',
      icon: '🗓️',
      title: `Ponle fecha a ${goal.name}`,
      body: `Sin fecha límite no hay ritmo que seguir. Con ${money(goal.allocatedMonthly || goal.requiredMonthly)} al mes la lograrías ${goal.projectedDate ? `hacia el ${prettyDate(goal.projectedDate)}` : 'cuando liberes dinero libre'}.`,
      action: { label: 'Poner fecha', kind: 'edit_goal', goalId: goal.goalId },
    });
  }
}

/**
 * Todas las metas paradas por la misma razón: no hay ingresos cargados.
 *
 * Una sola tarjeta y no una por meta. Con dos metas activas salían dos avisos
 * idénticos —«Pagar tarjetas no llega a tiempo», «Viajar a Uruguay y Argentina
 * no llega a tiempo»— repitiendo el mismo «$0» sin decir de dónde venía.
 *
 * NO lleva acción a propósito: la cabecera ya convierte «Ingresos» en su botón
 * principal justo en este caso, y pedir el dato por segunda vez a media
 * pantalla de distancia es la duplicación que esa decisión evitaba. Aquí se
 * explica la CONSECUENCIA, que es lo que faltaba, y se señala el botón.
 */
function adviceForStalledGoals(cash: CashFlow, goals: GoalProjection[], out: Advice[]): void {
  if (cash.monthlyIncome > 0) return;

  const paradas = goals.filter((g) => g.status === 'active' && g.remaining > 0);
  if (paradas.length === 0) return;

  const total = round2(paradas.reduce((s, g) => s + g.requiredMonthly, 0));
  const nombres = paradas.map((g) => `«${g.name}»`).join(paradas.length === 2 ? ' y ' : ', ');

  out.push({
    id: 'goals-need-income',
    tone: 'warning',
    icon: '⏸️',
    title: paradas.length === 1
      ? `${paradas[0].name} está en pausa`
      : `Tus ${paradas.length} metas están en pausa`,
    body: `El plan todavía no sabe cuánto ganas, así que calcula con $0 entrando al mes y no puede reservar nada para ${nombres}. No es que las metas estén mal planteadas: es que le faltan los ingresos para repartir.`,
    steps: [
      `Toca «Ingresos» arriba y registra lo que entra al mes.`,
      paradas.length === 1
        ? `Para llegar a tiempo haría falta apartar ${money(total)} al mes.`
        : `Entre todas piden ${money(total)} al mes: al cargar tu ingreso verás cuánto alcanza de verdad.`,
    ],
  });
}

function adviceForSurplus(cash: CashFlow, goals: GoalProjection[], out: Advice[]): void {
  if (cash.unallocated <= 1) return;

  const priority = goals.find((g) => g.status === 'active' && g.remaining > 0);
  if (!priority) {
    out.push({
      id: 'surplus-no-goals',
      tone: 'idea',
      icon: '✨',
      title: `Te sobran ${money(cash.unallocated)} al mes sin destino`,
      body: 'Ese dinero sin nombre es el que se evapora. Créale una meta: un fondo de emergencia de 3 meses de gastos es el mejor primer objetivo.',
      action: { label: 'Crear meta', kind: 'add_goal' },
    });
    return;
  }

  const nuevosMeses = monthsToReach(priority.remaining, priority.allocatedMonthly + cash.unallocated);
  const mesesActuales = monthsToReach(priority.remaining, priority.allocatedMonthly);
  const ahorro = mesesActuales !== null && nuevosMeses !== null ? mesesActuales - nuevosMeses : null;

  out.push({
    id: 'surplus-boost',
    tone: 'idea',
    icon: '🚀',
    title: `Tienes ${money(cash.unallocated)} libres cada mes`,
    body: ahorro && ahorro > 0
      ? `Si los mandas a ${priority.name} adelantas la meta ${ahorro} ${ahorro === 1 ? 'mes' : 'meses'}. Programa la transferencia el mismo día que cobras: lo que no se aparta primero, se gasta.`
      : `Mándalos a ${priority.name} o crea un fondo de emergencia. Programa la transferencia el mismo día que cobras: lo que no se aparta primero, se gasta.`,
    action: { label: 'Registrar aporte', kind: 'contribute', goalId: priority.goalId },
  });
}

/** Meses que se adelanta una meta si recibe `extra` más cada mes. */
export function monthsSavedWith(goal: GoalProjection, extra: number): number {
  if (extra <= 0 || goal.remaining <= 0) return 0;
  const before = monthsToReach(goal.remaining, goal.allocatedMonthly);
  const after = monthsToReach(goal.remaining, goal.allocatedMonthly + extra);
  if (after === null) return 0;
  if (before === null) return 0; // sin ritmo previo no hay "adelanto" que medir
  return Math.max(0, before - after);
}

/** Traduce un ahorro mensual en avance concreto sobre la meta prioritaria. */
function impactOnGoal(goals: GoalProjection[], extra: number): string {
  const target = goals.find((g) => g.status === 'active' && g.remaining > 0);
  if (!target || extra <= 0) return '';
  const saved = monthsSavedWith(target, extra);
  if (saved > 0) return ` Mandándolos a «${target.name}» la adelantas ${saved} ${saved === 1 ? 'mes' : 'meses'}.`;
  return ` Son ${money(extra)} más al mes para «${target.name}».`;
}

/**
 * Consejos de super basados en las compras registradas: ritmo del mes,
 * tendencia contra el promedio y la categoría que más pesa.
 */
function adviceForGroceries(input: PlanInput, cash: CashFlow, goals: GoalProjection[], out: Advice[]): void {
  const g = input.groceries;

  if (!g || (g.monthsWithData === 0 && g.spentThisMonth === 0)) {
    // Sin ingresos el consejo prioritario es otro; no saturar el arranque.
    if (cash.monthlyIncome <= 0) return;
    out.push({
      id: 'grocery-no-purchases',
      tone: 'info',
      icon: '🧾',
      title: 'Registra tus compras y el plan se afina solo',
      body: 'Todavía no hay tickets cargados, así que el super se estima con tu límite. En cuanto registres compras uso tu gasto real: el ritmo del mes, la tendencia y las categorías que más pesan.',
      action: { label: 'Ir a Presupuesto', kind: 'open_budget' },
    });
    return;
  }

  const enRiesgo = goals.some((p) => p.feasibility === 'at_risk' || p.feasibility === 'tight');

  // 1. Ritmo del mes contra el límite declarado. Igual que la tendencia, no
  //    tiene sentido antes de que haya días suficientes para proyectar.
  const RITMO_FIABLE = g.daysElapsed >= 7;
  if (RITMO_FIABLE && g.limit > 0 && g.overLimit > 1) {
    out.push({
      id: 'grocery-pace-over-limit',
      tone: 'warning',
      icon: '🛒',
      title: `Vas a cerrar el super en ${money(g.projectedMonthEnd)}`,
      body: `Llevas ${money(g.spentThisMonth)} en ${g.daysElapsed} días (${money(g.dailyPace)} diarios) y tu límite es ${money(g.limit)}: te pasarías ${money(g.overLimit)}. Ese exceso sale del dinero de tus metas.${impactOnGoal(goals, g.overLimit)}`,
      action: { label: 'Ver presupuesto', kind: 'open_budget' },
    });
  } else if (RITMO_FIABLE && g.limit > 0 && g.overLimit < -1 && g.spentThisMonth > 0) {
    const sobrante = Math.abs(g.overLimit);
    // Sin meta activa no hay dónde aportar: se invita a crear una.
    const destino = goals.find((p) => p.status === 'active' && p.remaining > 0);
    out.push({
      id: 'grocery-under-limit',
      tone: 'good',
      icon: '🥬',
      title: `Vas ${money(sobrante)} por debajo de tu límite de super`,
      body: `A este ritmo cierras el mes en ${money(g.projectedMonthEnd)} contra un límite de ${money(g.limit)}. Ese sobrante no es tuyo hasta que lo apartas.${destino ? impactOnGoal(goals, sobrante) : ' Crea una meta y ese dinero deja de evaporarse.'}`,
      action: destino
        ? { label: 'Registrar aporte', kind: 'contribute', goalId: destino.goalId }
        : { label: 'Crear meta', kind: 'add_goal' },
    });
  }

  // 2. Tendencia contra el promedio histórico. Los primeros días del mes no
  //    dicen nada: sin compras aún, la proyección es $0 y saldría un absurdo
  //    "estás gastando 100% menos".
  const RITMO_FIABLE_DESDE_DIA = 7;
  if (g.trendPct !== null && g.monthsWithData >= 2 && g.daysElapsed >= RITMO_FIABLE_DESDE_DIA) {
    const diff = Math.abs(g.projectedMonthEnd - g.avgMonthly);
    if (g.trendPct >= 15) {
      const culpable = g.biggestMover
        ? ` Lo que más subió es ${g.biggestMover.category}: ${money(g.biggestMover.currentMonth)} contra ${money(g.biggestMover.prevMonth)} el mes pasado.`
        : '';
      out.push({
        id: 'grocery-trend-up',
        tone: 'warning',
        icon: '📈',
        title: `Tu super va ${Math.round(g.trendPct)}% arriba de tu promedio`,
        body: `Proyectas ${money(g.projectedMonthEnd)} frente a los ${money(g.avgMonthly)} que gastas normalmente — ${money(diff)} de más.${culpable} Volver a tu promedio le devuelve ese dinero a tus metas.`,
        action: { label: 'Ver presupuesto', kind: 'open_budget' },
      });
    } else if (g.trendPct <= -15) {
      out.push({
        id: 'grocery-trend-down',
        tone: 'good',
        icon: '📉',
        title: `Estás gastando ${Math.abs(Math.round(g.trendPct))}% menos en super`,
        body: `Proyectas ${money(g.projectedMonthEnd)} contra tu promedio de ${money(g.avgMonthly)}: ${money(diff)} liberados este mes.${impactOnGoal(goals, diff)}`,
      });
    }
  }

  // 3. La categoría que más pesa — solo si hay metas que necesitan aire.
  const top = g.categories[0];
  if (enRiesgo && top && top.share >= 20 && top.currentMonth > 0) {
    const recorte = top.currentMonth * 0.15;
    out.push({
      id: 'grocery-category-lever',
      tone: 'idea',
      icon: '🥑',
      title: `${top.category} se lleva el ${Math.round(top.share)}% de tu super`,
      body: `Son ${money(top.currentMonth)} este mes. Recortar un 15% ahí libera ${money(recorte)} mensuales — ${money(recorte * 12)} al año — sin tocar el resto de la despensa: marca propia, comprar por peso y revisar el inventario antes de salir.${impactOnGoal(goals, recorte)}`,
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
  }

  // 4. Muchas visitas al super: cada viaje extra es compra impulsiva.
  if (enRiesgo && g.tripsThisMonth >= 8 && g.spentThisMonth > 0) {
    const porViaje = g.spentThisMonth / g.tripsThisMonth;
    out.push({
      id: 'grocery-trip-frequency',
      tone: 'idea',
      icon: '🚗',
      title: `Llevas ${g.tripsThisMonth} visitas al super este mes`,
      body: `Cada visita promedia ${money(porViaje)}. Concentrar las compras en una vez por semana suele recortar el gasto sin comer distinto — el ticket sube, pero el total del mes baja porque desaparece la compra de paso.`,
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
  }
}

/**
 * Consejos sobre el gasto que no es super.
 *
 * Es el gasto más fácil de mover de todo el plan —nadie deja de pagar la renta,
 * pero sí puede comer fuera una vez menos— y hasta ahora no aparecía en ningún
 * consejo porque ni siquiera se medía. Por eso el mensaje se dice siempre en
 * días de meta ganados, no en un porcentaje abstracto.
 */
function adviceForOtherSpend(input: PlanInput, cash: CashFlow, goals: GoalProjection[], out: Advice[]): void {
  const o = input.otherSpend;
  if (!o || !o.hasData || cash.monthlyIncome <= 0) return;

  const top = o.byKind[0];

  // 1. Un tipo de gasto se está comiendo el mes. El 35 % es el corte: por
  //    debajo de eso el reparto es normal y señalarlo sería alarmismo.
  if (top && top.share >= 35 && top.currentMonth > 0) {
    const recorte = top.currentMonth * 0.25;
    const meta = expenseKindMeta(top.kind);
    out.push({
      id: `other-top-${top.kind}`,
      tone: 'idea',
      icon: meta.emoji,
      title: `${meta.groupLabel} se lleva ${money(top.currentMonth)} este mes`,
      body: `Es el ${Math.round(top.share)} % de lo que gastas fuera del super, en ${top.count} ${top.count === 1 ? 'ticket' : 'tickets'}. Bajarlo una cuarta parte libera ${money(recorte)} al mes — ${money(recorte * 12)} al año.${impactOnGoal(goals, recorte)}`,
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
  }

  // 2. Tendencia contra el promedio: mismo criterio que el super — hacen falta
  //    dos meses cerrados y una semana de mes para que signifique algo.
  if (o.trendPct !== null && o.monthsWithData >= 2 && o.projectedMonthEnd > 0) {
    const diff = Math.abs(o.projectedMonthEnd - o.avgMonthly);
    if (o.trendPct >= 20) {
      const culpable = o.biggestMover
        ? ` Lo que más subió es ${expenseKindMeta(o.biggestMover.kind).groupLabel}: ${money(o.biggestMover.currentMonth)} contra ${money(o.biggestMover.prevMonth)} el mes pasado.`
        : '';
      out.push({
        id: 'other-trend-up',
        tone: 'warning',
        icon: '📈',
        title: `Tus gastos fuera del super van ${Math.round(o.trendPct)} % arriba`,
        body: `Proyectas ${money(o.projectedMonthEnd)} frente a los ${money(o.avgMonthly)} que sueles gastar — ${money(diff)} de más.${culpable} Ese dinero salía de tus metas sin que nada lo dijera.`,
        action: { label: 'Ver mis compras', kind: 'open_trips' },
      });
    } else if (o.trendPct <= -20) {
      out.push({
        id: 'other-trend-down',
        tone: 'good',
        icon: '📉',
        title: `Estás gastando ${Math.abs(Math.round(o.trendPct))} % menos fuera del super`,
        body: `Proyectas ${money(o.projectedMonthEnd)} contra tu promedio de ${money(o.avgMonthly)}: ${money(diff)} liberados este mes.${impactOnGoal(goals, diff)}`,
      });
    }
  }
}

export function buildAdvice(
  input: PlanInput,
  cash: CashFlow,
  goals: GoalProjection[],
  debts: DebtOverview,
  scopes?: ScopeBreakdown,
): Advice[] {
  const out: Advice[] = [];

  adviceForCashFlow(cash, out);
  if (scopes) adviceForScopes(scopes, out);
  adviceForCredits(debts, out);
  adviceForDebt(cash, debts, out);

  // Sin metas no se emite consejo: la sección "Tus metas" ya muestra su propio
  // estado vacío con el mismo mensaje, y repetirlo llenaba la pantalla de
  // instrucciones duplicadas.
  const active = goals.filter((g) => g.status === 'active');
  for (const goal of active) adviceForGoal(goal, cash, input, out);
  adviceForStalledGoals(cash, goals, out);

  adviceForGroceries(input, cash, goals, out);
  adviceForOtherSpend(input, cash, goals, out);
  adviceForSurplus(cash, goals, out);

  return out.sort((a, b) => TONE_WEIGHT[a.tone] - TONE_WEIGHT[b.tone]);
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export function buildFinancePlan(input: PlanInput): FinancePlan {
  const now = input.now ?? new Date();
  const extraMonthly = Math.max(0, input.extraMonthly ?? 0);

  const monthlyIncome = totalMonthlyIncome(input.incomes);
  const fixedPayments = input.fixedPayments.reduce((s, p) => s + Math.max(0, p.amount), 0);
  const groceriesEstimate = Math.max(0, input.groceriesMonthly);
  // Comer fuera y la gasolina no son super, pero salen de la misma cuenta el
  // mismo mes. Restarlos aquí es lo que hace que "te queda libre" sea cierto.
  const otherExpenses = Math.max(0, input.otherExpensesMonthly ?? 0);

  // La cuota de una tarjeta o un crédito es dinero comprometido igual que la
  // renta: si no se resta aquí, el plan cree que hay más libre del que hay y
  // promete metas con dinero que ya tiene dueño.
  const credits = input.credits ?? [];
  const creditPayments = credits.reduce((s, c) => s + Math.max(0, c.installment), 0);

  const available =
    monthlyIncome - fixedPayments - groceriesEstimate - otherExpenses - creditPayments + extraMonthly;

  const debts = buildDebtOverview(input.fixedPayments, input.goals, credits, available);
  const goalsBudget = Math.max(0, available - debts.monthlyCatchUp);

  const projections = input.goals.map((g) => projectGoal(g, now)).sort(compareGoals);
  const overrides = new Map(input.goals.map((g) => [g.id, g.monthlyOverride]));
  const unallocated = allocate(projections, goalsBudget, overrides);
  for (const p of projections) finishProjection(p, now, goalsBudget);

  const allocatedToGoals = round2(projections.reduce((s, p) => s + p.allocatedMonthly, 0));

  const cashFlow: CashFlow = {
    monthlyIncome: round2(monthlyIncome),
    fixedPayments: round2(fixedPayments),
    groceriesEstimate: round2(groceriesEstimate),
    otherExpenses: round2(otherExpenses),
    creditPayments: round2(creditPayments),
    available: round2(available),
    debtCatchUp: debts.monthlyCatchUp,
    goalsBudget: round2(goalsBudget),
    allocatedToGoals,
    unallocated: round2(Math.max(0, unallocated)),
    savingsRate: monthlyIncome > 0 ? round2(clamp(available / monthlyIncome, -10, 1)) : 0,
    extraMonthly: round2(extraMonthly),
  };

  const scopes = buildScopeBreakdown(input, cashFlow.groceriesEstimate, cashFlow.otherExpenses);
  const advice = buildAdvice(input, cashFlow, projections, debts, scopes);
  const healthScore = computeHealthScore(cashFlow, projections, debts);

  return {
    cashFlow,
    goals: projections,
    debts,
    scopes,
    advice,
    healthScore,
    currency: 'USD',
    generatedAt: now.toISOString(),
  };
}

/**
 * Simulación "¿y si…?": recalcula el plan con dinero extra al mes.
 * La usa el deslizador de escenarios sin tocar nada en la base de datos.
 */
export function simulatePlan(input: PlanInput, extraMonthly: number): FinancePlan {
  return buildFinancePlan({ ...input, extraMonthly });
}
