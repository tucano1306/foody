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

import type { DuplicateSuspect } from './duplicate-obligations';
import type { TipoDePromo } from './condiciones-credito';
import { monthsUntilDate } from './debt-engine';
import { avisoDePromo, promoRisk } from './debt-promo';
import { personalGroceryInsight, type BaselineSource, type GroceryInsight } from './grocery-insights';
import { personalOtherSpend, type OtherSpendInsight } from './other-spend';
import {
  buildBusinessResult,
  normalizeShare,
  splitAmount,
  type BusinessResult,
} from './expense-scope';

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type GoalKind = 'trip' | 'debt' | 'project' | 'purchase' | 'emergency';
export type GoalStatus = 'active' | 'paused' | 'done';
export type IncomeFrequency =
  | 'monthly'
  | 'biweekly'
  | 'weekly'
  /** Total de un año COMPLETO: se reparte entre 12. */
  | 'yearly'
  /**
   * Lo que se lleva cobrado del año en curso, de enero a hoy.
   *
   * No es lo mismo que `yearly` y por eso no comparte botón: $31.397,50 de
   * sueldo anual son $2.616,46 al mes, pero $31.397,50 cobrados entre enero y
   * el 30 de agosto son $3.924,69 al mes. Dividir un acumulado entre 12
   * inventa cuatro meses que todavía no han pasado.
   */
  | 'ytd'
  | 'one_time';

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
  /**
   * Día en que entró el dinero, YYYY-MM-DD. Solo lo usa `one_time`.
   *
   * Un cheque no es una tasa mensual: es dinero que llegó UN día. Cuenta
   * entero en el mes en que cayó y no cuenta en ninguno más, que es justo lo
   * que distingue «cobré $2.300 este mes» de «gano $2.300 al mes».
   */
  receivedOn?: string | null;
  /**
   * Día en que se apuntó (o se actualizó) la cifra, YYYY-MM-DD. Solo lo usa
   * `ytd`.
   *
   * Un acumulado del año es una FOTO: «llevo $31.397,50 cobrados» es verdad
   * el 30 de agosto, cubre enero–agosto y no dice nada de octubre. Antes se
   * dividía entre los meses que iban HOY y se sumaba a cada mes como si
   * siguiera entrando: en octubre el Plan contaba $3.140 de un trabajo que ya
   * no pagaba, y decía «entran $4.526» con $1.386 cobrados de verdad. Ahora la
   * media sale de los meses que la foto cubre, y solo cuenta el mes en que se
   * hizo; actualizarla la vuelve a contar.
   */
  asOf?: string | null;
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
  /**
   * Tarjeta o crédito que esta meta se propone liquidar.
   *
   * Con esto puesto, el objetivo y lo abonado NO se escriben a mano: se leen
   * de la deuda. Eran dos copias del mismo dinero y derivaban solas — una meta
   * decía «llevas $157» sobre una tarjeta que no había bajado un centavo.
   */
  debtId?: string | null;
  /**
   * La fecha de la meta la pone la deuda, no el usuario.
   *
   * Una meta pasada desde Deudas nace con la fecha que la deuda propone: el
   * fin del 0 %, o cuándo termina a la cuota de hoy. Esa segunda era una foto
   * del día en que se creó: tras un abono grande la deuda acababa en un mes y
   * la meta seguía diciendo «faltan 115 días». Con esto puesto la fecha se
   * vuelve a leer de la deuda en cada carga, igual que el saldo. Se apaga en
   * cuanto el usuario escribe su propia fecha: esa es una decisión suya.
   */
  dateFollowsDebt?: boolean;
}

/** Lo que hace falta saber de una deuda para alimentar la meta que la persigue. */
export interface GoalDebtLink {
  originalAmount: number;
  currentBalance: number;
  /**
   * Lo más que se ha debido desde que la meta existe (el saldo más alto que
   * dejó ver el libro de movimientos). `null` si no ha habido movimientos.
   */
  peakBalance?: number | null;
  /**
   * La fecha que la deuda propone HOY (YYYY-MM-DD, o `null` = no termina
   * nunca a este ritmo). `undefined` = no se sabe —la deuda ya está pagada o
   * no está en el plan—, y entonces la meta conserva la fecha que tenía.
   */
  targetDate?: string | null;
}

/**
 * Una meta que persigue una tarjeta lee sus cifras DE la tarjeta.
 *
 * El problema que resuelve: la meta y la deuda eran dos copias del mismo
 * dinero, cada una con su número escrito a mano, y derivaban solas. En datos
 * reales una meta decía «llevas $157 de $11,440» sobre una tarjeta que no
 * había bajado un centavo, y otra apuntaba a $1,014 cuando la deuda era de
 * $1,026.54. Ninguna de las dos cifras era falsa cuando se escribió: lo que
 * faltaba era que una siguiera a la otra.
 *
 * Con el enganche puesto, abonar en Deudas mueve la meta sin tocar nada más,
 * y registrar un consumo la mueve al revés. Es la misma deuda vista desde el
 * plan.
 *
 * `target = max(original, saldo)` y no `original` a secas: un consumo nuevo
 * puede dejar el saldo POR ENCIMA de lo que se debía al abrir la deuda, y
 * entonces «llevas abonado» saldría negativo y el objetivo sería menor que lo
 * que falta. Así el objetivo crece con la deuda, que es lo que de verdad pasó.
 *
 * Y con el PICO (`peakBalance`), el objetivo además no se encoge al abonar.
 * Sin él, una tarjeta que abrió en $200 y subió a $800 con consumos tenía el
 * objetivo pegado al saldo: abonar $300 la dejaba en «$0 de $500», un abono
 * que no movía la meta. El pico recuerda los $800: «$300 de $800».
 *
 * La fecha, igual que las cifras: si la meta la tomó de la deuda
 * (`dateFollowsDebt`), se vuelve a leer de ella. Un abono acerca la fecha de
 * liquidación y un consumo la aleja; la meta dice lo mismo que Deudas.
 */
export function goalWithDebt(goal: FinanceGoal, debt: GoalDebtLink | null | undefined): FinanceGoal {
  if (!goal.debtId || !debt) return goal;
  const dinero = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  const saldo = dinero(debt.currentBalance);
  const target = round2(Math.max(dinero(debt.originalAmount), saldo, dinero(debt.peakBalance)));
  const conCifras = { ...goal, targetAmount: target, savedAmount: round2(Math.max(0, target - saldo)) };
  return goal.dateFollowsDebt === true && debt.targetDate !== undefined
    ? { ...conCifras, targetDate: debt.targetDate }
    : conCifras;
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
  /**
   * Id del pago mensual que YA cobra esta cuota, si el usuario lo enlazó.
   *
   * La cuota del coche vive legítimamente en los dos sitios: en Pagos por el
   * recordatorio y el día de cobro, en Deudas por el saldo y el interés. Pero
   * el dinero sale UNA vez, y el plan restaba las dos —$1.097 de «GMC» en
   * pagos fijos y otros $1.097 de «Auto» en cuotas— inflando el gasto del mes
   * sin que nada lo explicara.
   *
   * Con el enlace puesto manda el pago mensual (es el que tiene día de cobro y
   * marca de pagado) y la cuota deja de restarse. Ver duplicate-obligations.ts.
   */
  linkedPaymentId?: string | null;
  /**
   * Lo que EXIGE el banco este mes: el mínimo de Deudas (ver
   * `minimosDelBanco`). Lo que `installment` pasa de aquí es el plan del
   * usuario para liquidarla antes, no una obligación, y el plan lo cuenta
   * aparte. Sin él, la cuota entera cuenta como mínimo: lo de siempre.
   */
  minimumPayment?: number;
  /** YYYY-MM-DD: último día de su 0 %, si tiene uno. */
  promoEndsOn?: string | null;
  /** APR que cobra cuando se acaba el 0 %. */
  rateAfterPromo?: number | null;
  promoKind?: TipoDePromo;
  /** El interés diferido que imprime el estado, si se copió. */
  deferredInterest?: number | null;
  /** YYYY-MM-DD: desde cuándo corre un interés diferido. */
  openedAt?: string | null;
  /** Día del mes en que vence: cuántas cuotas caben antes del fin del 0 %. */
  dueDay?: number | null;
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
  /**
   * Cuotas que podrían estar cobradas ya como pago mensual, sin resolver.
   *
   * Las calcula duplicate-obligations.ts; aquí solo se convierten en un aviso.
   * Mientras estén sin resolver el plan resta ese dinero DOS veces, así que es
   * de lo más grave que puede decir el consejero: no es un consejo de ahorro,
   * es «esta cifra está mal».
   */
  duplicateObligations?: readonly DuplicateSuspect[];
  /** Dinero extra mensual para simular escenarios ("¿y si aporto $200 más?"). */
  extraMonthly?: number;
  now?: Date;
}

// ─── Tipos de salida ──────────────────────────────────────────────────────────

export interface CashFlow {
  /** Todo lo que entra este mes: lo que se repite más los cheques que cayeron. */
  monthlyIncome: number;
  /** La parte que se repite todos los meses. */
  recurringIncome: number;
  /**
   * Los cheques y pagos sueltos cobrados este mes.
   *
   * Va aparte de `recurringIncome` porque no es lo mismo: este dinero está
   * ahora y puede no estar el mes que viene. Juntarlos en una sola cifra haría
   * que la app dijese «ganas $X al mes» sobre algo que no se repite.
   */
  oneTimeIncome: number;
  fixedPayments: number;
  groceriesEstimate: number;
  /** Comer fuera, farmacia, gasolina, hogar: los tickets que no son de super. */
  otherExpenses: number;
  /** Suma de las cuotas de tarjetas y créditos: lo que el plan les aparta. */
  creditPayments: number;
  /**
   * De esas cuotas, lo que EXIGE el banco: los mínimos de las tarjetas y la
   * cuota de un préstamo, que ya es la del contrato.
   */
  creditMinimums: number;
  /**
   * El resto de las cuotas: lo que el usuario decidió abonar DE MÁS para
   * liquidar antes —casi siempre, llegar a cero antes de que acabe un 0 %—.
   *
   * Va aparte porque es una decisión y no un gasto. Sumado a los mínimos, una
   * tarjeta de $9,000 al 0 % con tres meses de promoción restaba $3,000 al mes
   * como si el banco los pidiera, y el consejero decía «gastas $3,000 más de lo
   * que ingresas» a quien solo debía un mínimo de $90.
   */
  creditPlanExtra: number;
  /**
   * Cómo queda el mes con lo que PIDE: ingreso − pagos fijos − super − otros
   * gastos − mínimos (+ extra simulado). Antes del plan de las tarjetas y de
   * las metas; `available` es esto menos `creditPlanExtra`.
   */
  afterObligations: number;
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
  /**
   * Lo libre tras lo que pide el mes (`afterObligations`) sobre el ingreso,
   * hasta 1. 0 si no hay ingreso registrado.
   *
   * Sobre lo que PIDE el mes y no sobre `available`: lo que se abona de más a
   * una tarjeta es, como una meta, un destino del dinero libre y no falta de
   * él. Con `available`, liquidar un 0 % a tiempo hundía la nota de salud como
   * si fuera un gasto.
   */
  savingsRate: number;
  extraMonthly: number;
  /**
   * Este mes entró dinero suelto (cheques, pagos por trabajo): lo cobrado
   * todavía puede crecer antes de que acabe.
   *
   * El plan cuenta solo lo cobrado —decisión del dueño, sin prometer cheques
   * que no han llegado—, así que a mitad de mes «te falta» es el mes en curso,
   * no un hueco. La pantalla lo dice como «faltan por cobrar» y el consejero no
   * lo trata como alarma; con un sueldo fijo, el mismo «te falta» sí lo es.
   */
  variableIncome: boolean;
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
  /**
   * Tarjeta que esta meta liquida, si la persigue.
   *
   * La pantalla lo necesita para no ofrecer «Aportar»: en una meta enganchada
   * lo abonado se LEE de la deuda, asi que un aporte a la meta no moveria
   * nada. Se abona en Deudas, y la meta se mueve sola.
   */
  debtId?: string | null;
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
  /**
   * Meta enlazada a una tarjeta que está en el plan: su cuota mensual.
   *
   * Esa cuota ya sale de «Libre al mes» como compromiso de la tarjeta, así que
   * ES el aporte de la meta. Antes la meta pedía además su propio aporte del
   * dinero libre: la tarjeta 3650 restaba $2,860 de cuota y su meta pedía
   * otros $3,642, unos $6,500 al mes por una deuda de $11,440.
   */
  cuotaTarjeta: number | null;
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
    /**
     * Su cuota ya la cobra un pago mensual, así que NO entra en
     * `creditPayments`. La UI lo dice para que las filas y el total cuadren.
     */
    countedInPayments: boolean;
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

/**
 * De qué habla el consejo.
 *
 * Sirve para agruparlos en pantalla: los de METAS van bajo su propio titulo,
 * porque leidos sueltos entre avisos de deudas y de super no queda claro a que
 * se refieren. Lo que no lleva tema es del mes en general.
 */
export type AdviceTopic = 'goals' | 'general';

/** Una cifra con su nombre, para la hoja de detalle de un consejo. */
export interface AdviceFigure {
  label: string;
  value: string;
}

export interface Advice {
  id: string;
  topic?: AdviceTopic;
  tone: AdviceTone;
  icon: string;
  /** Lo que pasa, con UNA cifra. Es lo que se lee en la lista. */
  title: string;
  /** Una frase, debajo del título: el porqué en corto. */
  body: string;
  /**
   * Las cifras que lo explican, cada una con su nombre.
   *
   * Antes iban dentro del párrafo: «Tus pagos fijos ($2,000), las cuotas de
   * tus créditos ($3,000), lo que gastas fuera del super ($300) más el super
   * ($300) superan tu ingreso de $2,500». Cinco cifras en una frase, y el
   * usuario no sabía cuál de ellas mirar. En columna, cada una dice qué es.
   */
  figures?: AdviceFigure[];
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

/**
 * Meses del año en curso que ya han empezado, contando el actual.
 *
 * El mes en marcha cuenta entero: repartir un acumulado entre «7 meses y 30
 * días» exige un divisor fraccionario que en enero se dispara —lo cobrado el
 * día 1 dividido entre 1/30 de mes daría un sueldo de treinta veces la cifra—.
 * Contar el mes empezado es estable todo el año y siempre peca de prudente.
 */
export function monthsElapsedThisYear(now: Date = new Date()): number {
  return now.getMonth() + 1;
}

/**
 * Ingreso mensual equivalente de una fuente según su frecuencia.
 *
 * `now` solo lo usa `ytd`, que es la única frecuencia cuyo resultado depende
 * de qué día es: un acumulado del año se reparte entre los meses que de
 * verdad han pasado, no entre doce.
 */
export function monthlyEquivalent(
  amount: number,
  frequency: IncomeFrequency,
  now: Date = new Date(),
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (frequency) {
    case 'weekly':   return (amount * 52) / 12;
    case 'biweekly': return (amount * 26) / 12;
    case 'yearly':   return amount / 12;
    case 'ytd':      return amount / monthsElapsedThisYear(now);
    case 'one_time': return 0;
    case 'monthly':
    default:         return amount;
  }
}

/**
 * El ingreso que se repite todos los meses.
 *
 * Los `one_time` valen 0 aquí a propósito: un cheque suelto no es una tasa
 * mensual y prometerlo para el mes que viene sería inventarlo. Lo que sí entró
 * este mes lo cuenta `totalOneTimeIncome`.
 */
export function totalMonthlyIncome(
  incomes: readonly IncomeSource[],
  now: Date = new Date(),
): number {
  return incomes
    .filter((i) => i.frequency !== 'one_time' && countsInMonth(i, now))
    .reduce((sum, i) => sum + monthlyRate(i, now), 0);
}

/** ¿Esa fecha YYYY-MM-DD cae en el mes de `now`? */
function landsInMonth(dateKey: string | null | undefined, now: Date): boolean {
  const m = (dateKey ?? '').match(/^(\d{4})-(\d{2})/);
  if (!m) return false;
  return Number(m[1]) === now.getFullYear() && Number(m[2]) === now.getMonth() + 1;
}

/** El mes (1-12) de una fecha YYYY-MM-DD, o `null` si no se entiende. */
function monthOfKey(dateKey: string | null | undefined): number | null {
  const m = (dateKey ?? '').match(/^\d{4}-(\d{2})/);
  const month = m ? Number(m[1]) : NaN;
  return month >= 1 && month <= 12 ? month : null;
}

/**
 * Los meses que cubre un acumulado: de enero al mes en que se apuntó. Sin
 * fecha (ingresos de antes de existir `asOf`), los que van hoy.
 */
export function ytdMonthsCovered(income: Pick<IncomeSource, 'asOf'>, now: Date = new Date()): number {
  return monthOfKey(income.asOf) ?? monthsElapsedThisYear(now);
}

/**
 * Lo que esta fuente vale al mes. Para un acumulado, su media sobre los meses
 * que cubre; para el resto, `monthlyEquivalent`. No dice si cuenta este mes:
 * eso es `countsInMonth`.
 */
export function monthlyRate(income: IncomeSource, now: Date = new Date()): number {
  if (income.frequency === 'ytd') {
    if (!Number.isFinite(income.amount) || income.amount <= 0) return 0;
    return income.amount / ytdMonthsCovered(income, now);
  }
  return monthlyEquivalent(income.amount, income.frequency, now);
}

/**
 * ¿Esta fuente pone dinero en el mes de `now`?
 *
 * - Un cheque suelto, solo en el mes en que se cobró.
 * - Un acumulado del año, solo en el mes en que se apuntó o se actualizó: es
 *   una foto, no una promesa.
 * - Lo que se repite (sueldo, quincena…), todos los meses.
 */
export function countsInMonth(income: IncomeSource, now: Date = new Date()): boolean {
  if (!income.isActive) return false;
  if (income.frequency === 'one_time') return landsInMonth(income.receivedOn, now);
  if (income.frequency === 'ytd') return income.asOf == null || landsInMonth(income.asOf, now);
  return true;
}

/**
 * Los cheques y pagos sueltos que cayeron ESTE mes, enteros.
 *
 * Sin esto, quien cobra por trabajos —hoy un cheque, la semana que viene
 * otro— no tenía forma de que la app viera un solo dólar: la única pregunta
 * era «¿cuánto ganas al mes?», y la respuesta honesta era «depende».
 */
export function totalOneTimeIncome(incomes: readonly IncomeSource[], now: Date = new Date()): number {
  return incomes
    .filter((i) => i.isActive && i.frequency === 'one_time' && landsInMonth(i.receivedOn, now))
    .reduce((sum, i) => sum + Math.max(0, i.amount), 0);
}

/** Lo que esta fuente aporta al mes en curso: la tasa mensual, o el cheque si cayó. */
export function incomeThisMonth(income: IncomeSource, now: Date = new Date()): number {
  if (!countsInMonth(income, now)) return 0;
  if (income.frequency === 'one_time') return Math.max(0, income.amount);
  return monthlyRate(income, now);
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
  } else if (monthsLeft < 1) {
    // Menos de un mes, o la fecha ya pasó: hace falta TODO, ya. Dividir entre
    // una fracción de mes daba cifras sin sentido: $817 que faltaban para
    // mañana salían como «$24,867.44 al mes» (817 ÷ 1/30.4).
    requiredMonthly = remaining;
  } else {
    requiredMonthly = remaining / monthsLeft;
  }

  const effectiveDays = daysLeft !== null && daysLeft > 0 ? daysLeft : null;

  return {
    goalId: goal.id,
    debtId: goal.debtId ?? null,
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
    cuotaTarjeta: null,
    shortfallMonthly: 0,
    projectedDate: null,
    monthsLate: 0,
    feasibility: 'no_date',
    // Una meta enganchada no la «logra» el usuario con un toque: la logra la
    // deuda al quedar en cero. Antes se quedaba en la lista de activas al
    // 100 %, con un botón «Abonar la tarjeta» sobre una tarjeta ya pagada,
    // hasta que alguien la marcaba. Solo se deriva aquí —la meta guardada
    // sigue `active`—: si la tarjeta vuelve a tener saldo, la meta vuelve sola.
    status: goal.debtId && goal.status === 'active' && targetAmount > 0 && remaining <= 0 ? 'done' : goal.status,
  };
}

/** Reparte `goalsBudget` entre las metas activas por orden de atención. */
function allocate(projections: GoalProjection[], goalsBudget: number, overrides: Map<string, number | null>): number {
  let pool = Math.max(0, goalsBudget);
  for (const p of projections) {
    if (p.status !== 'active' || p.remaining <= 0) continue;
    // La que se paga con la cuota de su tarjeta no toca el dinero libre: esa
    // cuota ya se restó antes de llegar aquí.
    if (p.cuotaTarjeta !== null) {
      p.allocatedMonthly = p.cuotaTarjeta;
      continue;
    }
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
  // El mismo día de la fecha todavía se llega: vencida es a partir de mañana.
  if ((p.daysLeft ?? 0) < 0) {
    p.feasibility = 'overdue';
    return;
  }
  if (months !== null && p.monthsLeft !== null) {
    p.monthsLate = round2(Math.max(0, months - Math.ceil(p.monthsLeft)));
  } else {
    p.monthsLate = 0;
  }
  if (p.cuotaTarjeta !== null) {
    // Su dinero es la cuota de la tarjeta, no el margen libre: no hay «justa».
    p.feasibility = p.allocatedMonthly + 0.01 >= p.requiredMonthly ? 'on_track' : 'at_risk';
    return;
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

/**
 * Cuotas que NO hay que restar: las que ya cobra un pago mensual.
 *
 * El enlace solo vale si el pago sigue existiendo y activo. Si el usuario borró
 * el recibo, el dinero vuelve a salir por la cuota y contarlo sería hacerlo
 * desaparecer del plan — el error contrario, y más difícil de detectar.
 */
function isCoveredByPayment(
  credit: CreditInput,
  fixedPayments: readonly FixedPaymentInput[],
): boolean {
  if (!credit.linkedPaymentId) return false;
  return fixedPayments.some((p) => p.id === credit.linkedPaymentId);
}

/** Lo que el banco exige de un crédito, sin pasar de su cuota. */
function minimoExigido(c: CreditInput): number {
  const cuota = Math.max(0, c.installment);
  return Math.min(cuota, Math.max(0, c.minimumPayment ?? cuota));
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
      countedInPayments: isCoveredByPayment(c, fixedPayments),
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
    // Las cuotas ya cobradas por un pago mensual quedan FUERA del total: ese
    // dinero ya está restado en `fixedPayments`.
    creditPayments: round2(
      creditOrder.filter((c) => !c.countedInPayments).reduce((s, c) => s + c.installment, 0),
    ),
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
    // `incomeThisMonth` y no la tasa mensual: un cheque cobrado por el negocio
    // vale 0 como tasa, así que el reparto lo dejaba fuera y el negocio volvía
    // a parecer que solo gasta.
    const split = splitAmount(incomeThisMonth(inc, input.now ?? new Date()), share);
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
    // Igual que en el flujo: la cuota que ya cobra un pago mensual no se
    // reparte otra vez, o el negocio parecería gastar el doble. Era justo lo
    // que pasaba: $2.314 de pagos fijos + $1.097 de la misma cuota = $3.411.
    if (isCoveredByPayment(c, input.fixedPayments)) continue;
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
    // Lo VENCIDO se reparte igual que la cuota.
    //
    // Antes solo se repartía la cuota: el permiso de Larry's, 100 % del
    // negocio, quedaba en $0 al mes, pero sus $600 sin pagar seguían en «Ir al
    // día con lo vencido» y le quitaban 13 puntos a la salud personal con el
    // negocio apagado. Sin deuda personal tampoco hay meses personales sin
    // pagar.
    fixedPayments: input.fixedPayments.map((p) => {
      const share = normalizeShare(p.businessShare);
      const accumulatedDebt = splitAmount(p.accumulatedDebt, share).personal;
      return {
        ...p,
        amount: splitAmount(p.amount, share).personal,
        accumulatedDebt,
        missedMonths: accumulatedDebt > 0 ? p.missedMonths : 0,
        businessShare: 0,
      };
    }),
    // El saldo y el interés se reparten IGUAL que la cuota.
    //
    // Antes solo se repartía la cuota, y el resultado era un plan que se
    // contradecía: el coche del negocio aportaba $0 al mes —correcto— pero su
    // saldo entero seguía sumando en «lo que debes», así que la pantalla decía
    // a la vez que esa deuda no es tuya y que la debes. Cualquiera lee eso como
    // que la app está metiendo el negocio en su plan personal.
    credits: (input.credits ?? []).map((c) => {
      const share = normalizeShare(c.businessShare);
      return {
        ...c,
        balance: splitAmount(c.balance, share).personal,
        installment: splitAmount(c.installment, share).personal,
        monthlyInterest: splitAmount(c.monthlyInterest, share).personal,
        // El mínimo, igual que la cuota: si no, el plan personal pediría el
        // mínimo entero de una tarjeta que es medio del negocio.
        ...(c.minimumPayment !== undefined
          ? { minimumPayment: splitAmount(c.minimumPayment, share).personal }
          : {}),
        businessShare: 0,
      };
    }),
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
    // Los PANORAMAS también, no solo las cifras que resta la cascada.
    //
    // Aquí estaba la mezcla: el plan restaba el super ya repartido, pero el
    // consejero lee estos objetos de detalle —el ritmo del mes, las categorías,
    // los tipos de gasto— y los leía SIN repartir. Con el negocio apagado, la
    // cascada hablaba de dinero personal y los consejos de la misma pantalla
    // citaban cifras que incluían el negocio.
    groceries: input.groceries
      ? personalGroceryInsight(input.groceries, normalizeShare(input.groceriesBusinessShare))
      : input.groceries,
    otherSpend: input.otherSpend
      ? personalOtherSpend(input.otherSpend, normalizeShare(input.otherBusinessShare))
      : input.otherSpend,
  };
}

/**
 * Una de las tres partes de la salud financiera, ya explicada.
 *
 * El número del anillo no se podía auditar: 71 sobre 100 no dice qué mira ni
 * qué habría que mover para subirlo. Esto es el desglose que la pantalla
 * enseña al tocarlo, calculado por el MISMO código que produce la nota —no
 * una explicación escrita aparte que se desincroniza al primer ajuste.
 */
export interface HealthPart {
  key: 'flow' | 'debt' | 'goals';
  emoji: string;
  /** Qué mide esta parte, en una frase corta. */
  label: string;
  /** Puntos obtenidos, ya redondeados para que las tres sumen la nota. */
  points: number;
  /** Tope de esta parte: 40 el flujo, 30 la deuda, 30 las metas. */
  maxPoints: number;
  /** points / maxPoints, 0–1 — para la barra. */
  ratio: number;
  /** La medida real detrás de los puntos, con las cifras del usuario. */
  detail: string;
  /** Qué haría subir esta parte. `null` cuando ya está al tope. */
  hint: string | null;
}

export interface HealthBreakdown {
  /** La misma nota 0–100 que `FinancePlan.healthScore`. */
  score: number;
  /** Las tres partes, en orden de peso. Sus puntos suman exactamente `score`. */
  parts: HealthPart[];
  /** Sin ingreso declarado no hay nota que calcular: todo vale 0. */
  hasIncome: boolean;
}

/** 20 % de lo que entra: el margen libre que da los 40 puntos completos. */
const HEALTHY_SAVINGS_RATE = 0.2;

/**
 * Reparte los puntos enteros de forma que las partes sumen la nota.
 *
 * Redondear cada parte por su cuenta hacía que 39,6 + 30 + 29,7 se enseñara
 * como 40 + 30 + 30 = 100 debajo de un anillo que decía 99. El resto se da a
 * las partes con la fracción más alta (mayor resto), así la suma cuadra
 * siempre y ninguna parte se desvía más de un punto.
 */
function distributePoints(raw: readonly number[], total: number): number[] {
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * Salud financiera 0–100, desglosada. Tres partes: flujo libre sobre el
 * ingreso (40), ausencia de deuda vencida (30) y metas que van a tiempo (30).
 *
 * Todo lo que mira es del MES EN CURSO: el ingreso del mes, los pagos vencidos
 * que se arrastran hasta hoy y el ritmo que hoy llevan las metas. No es un
 * histórico ni un promedio del año.
 */
export function explainHealthScore(
  cash: CashFlow,
  goals: GoalProjection[],
  debts: DebtOverview,
): HealthBreakdown {
  if (cash.monthlyIncome <= 0) {
    return {
      score: 0,
      hasIncome: false,
      parts: [
        {
          key: 'flow',
          emoji: '💧',
          label: 'Lo que te queda libre',
          points: 0,
          maxPoints: 40,
          ratio: 0,
          detail: 'Sin ingresos cargados no se puede calcular.',
          hint: 'Registra lo que ganas al mes y la nota aparece sola.',
        },
        {
          key: 'debt',
          emoji: '📌',
          label: 'Ir al día con lo vencido',
          points: 0,
          maxPoints: 30,
          ratio: 0,
          detail: 'Sin ingresos cargados no se puede calcular.',
          hint: null,
        },
        {
          key: 'goals',
          emoji: '🎯',
          label: 'Metas que llegan a tiempo',
          points: 0,
          maxPoints: 30,
          ratio: 0,
          detail: 'Sin ingresos cargados no se puede calcular.',
          hint: null,
        },
      ],
    };
  }

  const flowRaw = clamp(cash.savingsRate / HEALTHY_SAVINGS_RATE, 0, 1) * 40;
  const debtRaw = debts.overdueTotal <= 0
    ? 30
    : clamp(1 - debts.overdueTotal / Math.max(cash.monthlyIncome, 1), 0, 1) * 30;

  const tracked = goals.filter((g) => g.status === 'active' && g.remaining > 0);
  const healthyGoals = tracked.filter((g) => g.feasibility === 'on_track' || g.feasibility === 'tight').length;
  const goalsRaw = tracked.length === 0 ? 30 : (healthyGoals / tracked.length) * 30;

  const score = Math.round(clamp(flowRaw + debtRaw + goalsRaw, 0, 100));
  const [flowPts, debtPts, goalPts] = distributePoints([flowRaw, debtRaw, goalsRaw], score);

  const ratePct = Math.round(cash.savingsRate * 100);
  const healthyAmount = cash.monthlyIncome * HEALTHY_SAVINGS_RATE;

  const flow: HealthPart = {
    key: 'flow',
    emoji: '💧',
    label: 'Lo que te queda libre',
    points: flowPts,
    maxPoints: 40,
    ratio: flowRaw / 40,
    // Con ingreso suelto, «falta» a mitad de mes son cheques que no han
    // llegado: se dice así, no como un mes que no cierra.
    detail: cash.afterObligations < 0
      ? cash.variableIncome
        ? `Van cobrados ${money(cash.monthlyIncome)}: faltan ${money(Math.abs(cash.afterObligations))} por cobrar para cubrir lo que pide el mes.`
        : `Lo que pide el mes pasa de lo que entra en ${money(Math.abs(cash.afterObligations))}: no queda nada libre.`
      : `Te queda libre el ${ratePct} % de lo que entra (${money(cash.afterObligations)} de ${money(cash.monthlyIncome)}).`,
    hint: flowRaw >= 40
      ? null
      : `Los 40 puntos son al quedarte con el 20 % — ${money(healthyAmount)} al mes.`,
  };

  const debt: HealthPart = {
    key: 'debt',
    emoji: '📌',
    label: 'Ir al día con lo vencido',
    points: debtPts,
    maxPoints: 30,
    ratio: debtRaw / 30,
    detail: debts.overdueTotal <= 0
      ? 'No arrastras ningún pago vencido.'
      : `Arrastras ${money(debts.overdueTotal)} de ${debts.overdueCount} ${debts.overdueCount === 1 ? 'pago vencido' : 'pagos vencidos'}.`,
    hint: debtRaw >= 30
      ? null
      : `Se compara lo vencido con tu ingreso del mes: abonar esos ${money(debts.overdueTotal)} devuelve los 30 puntos.`,
  };

  const goalsPart: HealthPart = {
    key: 'goals',
    emoji: '🎯',
    label: 'Metas que llegan a tiempo',
    points: goalPts,
    maxPoints: 30,
    ratio: goalsRaw / 30,
    detail: tracked.length === 0
      ? 'Todavía no hay metas que seguir, así que esta parte va completa.'
      : `${healthyGoals} de ${tracked.length} ${tracked.length === 1 ? 'meta va' : 'metas van'} a tiempo con lo que les asignas hoy.`,
    hint: goalsRaw >= 30
      ? null
      : `Cada meta que vuelve a ir a tiempo suma ${Math.round(30 / tracked.length)} puntos: baja su objetivo, alarga la fecha o súbele el aporte.`,
  };

  return { score, hasIncome: true, parts: [flow, debt, goalsPart] };
}

function computeHealthScore(cash: CashFlow, goals: GoalProjection[], debts: DebtOverview): number {
  return explainHealthScore(cash, goals, debts).score;
}

// ─── Consejos ─────────────────────────────────────────────────────────────────

/**
 * Orden de la lista: lo que hay que arreglar, lo que conviene saber, las ideas
 * para ahorrar y, al final, lo que va bien.
 *
 * Un dato de dinero real —cuándo se acaba un 0 %, cuánto cuesta un interés—
 * va antes que una idea para recortar el super: con la idea delante, lo que
 * importaba se quedaba escondido detrás de «Ver más».
 */
const TONE_WEIGHT: Record<AdviceTone, number> = { critical: 0, warning: 1, info: 2, idea: 3, good: 4 };

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

const meses = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;
const alMes = (n: number) => `${money(n)} al mes`;

/**
 * Una meta a la que se le puede mandar dinero: activa, sin terminar y sin una
 * deuda detrás.
 *
 * La que persigue una tarjeta lee lo abonado del saldo de la deuda, así que un
 * aporte «a la meta» no movería nada —la ruta de aportes responde 409—. Un
 * consejo que propusiera mandarle dinero llevaba a un callejón sin salida.
 */
function aceptaAportes(g: GoalProjection): boolean {
  return g.status === 'active' && g.remaining > 0 && !g.debtId;
}

/** «a», «a y b», «a, b y c» — como se enumera al hablar. */
function enumerate(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * El mismo pago contado dos veces.
 *
 * Va en `critical` y se emite antes que nada porque no es un consejo sobre cómo
 * gastar mejor: es la app avisando de que una cifra suya está mal. Mientras no
 * se resuelva, todo lo demás del plan —el dinero libre, lo que cabe en las
 * metas, el resultado del negocio— está calculado con ese dinero de más.
 */
function adviceForDuplicates(input: PlanInput, out: Advice[]): void {
  const dupes = input.duplicateObligations ?? [];
  if (dupes.length === 0) return;

  const total = round2(dupes.reduce((s, d) => s + d.amount, 0));
  const primero = dupes[0];
  const uno = dupes.length === 1;

  out.push({
    id: 'duplicate-obligations',
    tone: 'critical',
    icon: '👀',
    title: uno
      ? `¿«${primero.paymentName}» y «${primero.debtName}» son el mismo pago?`
      : `${dupes.length} pagos podrían estar contados dos veces`,
    body: `Si lo son, el plan resta ${money(uno ? primero.amount : total)} de más cada mes.`,
    figures: uno
      ? [
          { label: `«${primero.paymentName}» en Pagos`, value: alMes(primero.amount) },
          { label: `«${primero.debtName}» en Deudas`, value: alMes(primero.amount) },
        ]
      : dupes.map((d) => ({ label: `${d.paymentName} = ${d.debtName}`, value: alMes(d.amount) })),
    steps: [
      'Tenerlo en los dos sitios está bien: Pagos lleva el recordatorio y Deudas el saldo.',
      'Enlázalos en Deudas y el dinero se cuenta una sola vez.',
    ],
    action: { label: 'Revisar en Deudas', kind: 'open_debts' },
  });
}

/**
 * Recibos de Pagos que se quedaron sin marcar.
 *
 * Eran dos consejos —«tienes $X atrasados» y «orden sugerido: bola de
 * nieve»— que nombraban las mismas deudas con otras palabras. Ahora es uno:
 * cuáles y cuánto, en columna, y el orden en una línea.
 *
 * Lo primero que dice es que se pueden marcar: muchas veces un «atraso» es un
 * pago hecho que no se apuntó, y mandar a ponerse al día a quien ya pagó es el
 * aviso que hace dejar de creerle al consejero.
 */
function adviceForOverdue(debts: DebtOverview, out: Advice[]): void {
  if (debts.overdueTotal <= 0 || debts.payoffOrder.length === 0) return;

  const uno = debts.payoffOrder.length === 1;
  const primero = debts.payoffOrder[0];
  // El nombre y el importe, sin «2 meses»: un recibo semestral atrasado es UN
  // cobro, y contarlo en meses decía algo que no era.
  const figures: AdviceFigure[] = debts.payoffOrder.map((d) => ({ label: d.name, value: money(d.debt) }));
  figures.push({
    label: 'Para ponerte al día',
    value: debts.monthsToClear
      ? `${alMes(debts.monthlyCatchUp)} · ${meses(debts.monthsToClear)}`
      : 'este mes no queda dinero libre',
  });

  out.push({
    id: 'overdue-debt',
    tone: 'critical',
    icon: '📌',
    title: uno
      ? `«${primero.name}» lleva ${money(primero.debt)} sin pagar`
      : `${debts.payoffOrder.length} pagos atrasados: ${money(debts.overdueTotal)}`,
    body: uno
      ? 'Si ya lo pagaste, márcalo en Pagos y desaparece.'
      : 'Si ya los pagaste, márcalos en Pagos y desaparecen.',
    figures,
    ...(uno
      ? {}
      : { steps: [`Empieza por ${primero.name}: es el más chico, y al tacharlo su cuota ayuda con el siguiente.`] }),
    action: { label: 'Ver pagos', kind: 'open_payments' },
  });
}

/**
 * El fin de un 0 %: la fecha más cara del plan, y el consejero no la nombraba.
 *
 * Se cuenta con las MISMAS funciones que el aviso de Deudas y las
 * notificaciones (`avisoDePromo`, `promoRisk`), así que «para llegar a cero» es
 * la cuota que calcula la estrategia «antes de una fecha», contada en
 * vencimientos que caben y no en meses con decimales. Si las dos pantallas
 * contaran distinto, una diría «llegas» y la otra «no llegas» del mismo pago.
 *
 * Solo antes del fin. Después lo que cuesta ya lo dice el consejo de los
 * intereses, y dos avisos sobre el mismo interés eran dos lecturas de un hecho.
 *
 * Devuelve las tarjetas avisadas: la meta que persigue una de ellas no repite
 * «la cuota no llega» de lo mismo que aquí se acaba de decir.
 */
function adviceForPromos(credits: readonly CreditInput[], now: Date, out: Advice[]): Set<string> {
  const avisadas = new Set<string>();
  const hoy = toDateKey(now);

  for (const c of credits) {
    if (!c.promoEndsOn || c.rateAfterPromo == null) continue;
    const aviso = avisoDePromo(
      {
        currentBalance: c.balance,
        promoEndsOn: c.promoEndsOn,
        rateAfterPromo: c.rateAfterPromo,
        promoKind: c.promoKind ?? null,
        deferredInterest: c.deferredInterest ?? null,
        openedAt: c.openedAt ?? null,
      },
      hoy,
    );
    if (!aviso || aviso.fase !== 'antes') continue;

    const riesgo = promoRisk({
      balance: c.balance,
      installment: c.installment,
      promoEndsOn: c.promoEndsOn,
      rateAfterPromo: c.rateAfterPromo,
      dueDay: c.dueDay ?? null,
      now,
    });
    const llega = !riesgo.willMissDeadline;
    const cuando = aviso.dias === 0 ? 'hoy' : aviso.dias === 1 ? 'mañana' : `en ${aviso.dias} días`;
    // En un interés DIFERIDO lo que está en juego no es el interés de un mes:
    // es todo el interés desde el primer día, de golpe, por un centavo de saldo.
    const golpe = aviso.diferido ? `${aviso.diferido.estimado ? '~' : ''}${money(aviso.diferido.monto)}` : null;

    const cuotas = riesgo.monthsLeft > 0
      ? ` · ${riesgo.monthsLeft} ${riesgo.monthsLeft === 1 ? 'cuota' : 'cuotas'}`
      : '';
    // Cuando la cuota ES la que hace falta —lo normal con la estrategia «antes
    // de una fecha», que la calcula así—, «Tu cuota» y «Para llegar a cero»
    // decían la misma cifra en dos filas, y se leían como dos datos distintos.
    const cuotaJusta = Math.abs(riesgo.installmentToClear - c.installment) < 0.5;
    const figures: AdviceFigure[] = [
      { label: 'Saldo al 0 %', value: money(aviso.saldo) },
      { label: 'Último día al 0 %', value: prettyDate(aviso.fin) },
      ...(cuotaJusta
        ? [{ label: 'Tu cuota', value: `${alMes(c.installment)}${cuotas}` }]
        : [
            { label: 'Tu cuota', value: alMes(c.installment) },
            {
              label: 'Para llegar a cero',
              value: cuotas ? `${alMes(riesgo.installmentToClear)}${cuotas}` : money(riesgo.installmentToClear),
            },
          ]),
    ];
    // Con la fecha de la última cuota el «llegas» se puede comprobar: entre
    // ella y el fin del 0 % está todo el margen que hay. Es la que da Deudas.
    if (llega && riesgo.lastPaymentOn) {
      figures.push({ label: 'Última cuota', value: prettyDate(riesgo.lastPaymentOn) });
    }
    if (golpe) {
      figures.push({ label: 'Si queda saldo, cobran de golpe', value: golpe });
    } else if (!llega) {
      figures.push({ label: `Interés después (${aviso.apr} %)`, value: `~${alMes(riesgo.monthlyCostAfter)}` });
    }

    out.push({
      id: `promo-${c.id}`,
      tone: llega ? 'info' : aviso.dias <= 30 ? 'critical' : 'warning',
      icon: '⏳',
      title: `${c.name}: el 0 % se acaba ${cuando}`,
      body: llega
        ? `Tu cuota de ${money(c.installment)} la deja en cero a tiempo.`
        : golpe
          ? `A tu cuota quedarían ${money(riesgo.balanceAtEnd)}, y cobrarían ${golpe} de golpe.`
          : `A tu cuota quedarían ${money(riesgo.balanceAtEnd)} cobrando interés.`,
      figures,
      action: { label: 'Ver la tarjeta', kind: 'open_debts' },
    });
    avisadas.add(c.id);
  }

  return avisadas;
}

/**
 * Tarjetas y créditos: lo que no baja y lo que cuesta.
 *
 * El interés es el único gasto del plan que no compra nada: se va en mantener
 * viva una deuda. Por eso se nombra en dinero al mes y al año — «te cuesta $90
 * al mes» pesa mucho más que «tienes un 3 % mensual».
 */
function adviceForCredits(debts: DebtOverview, out: Advice[]): void {
  if (debts.creditBalance <= 0) return;

  if (debts.creditsStuck.length > 0) {
    const uno = debts.creditsStuck.length === 1;
    const c0 = debts.creditsStuck[0];
    const cuota = debts.creditOrder.find((c) => c.id === c0.id)?.installment ?? 0;
    out.push({
      id: 'credits-stuck',
      tone: 'critical',
      icon: '🛑',
      title: uno ? `${c0.name} no baja nunca` : `${debts.creditsStuck.length} créditos no bajan nunca`,
      body: uno
        ? 'Su cuota solo cubre el interés: el saldo no se mueve.'
        : 'Sus cuotas solo cubren el interés: los saldos no se mueven.',
      figures: uno
        ? [
            { label: 'Cuota', value: alMes(cuota) },
            { label: 'Interés', value: alMes(c0.monthlyInterest) },
          ]
        : debts.creditsStuck.map((c) => ({ label: c.name, value: `${alMes(c.monthlyInterest)} de interés` })),
      action: { label: 'Ver mis deudas', kind: 'open_debts' },
    });
  }

  if (debts.creditMonthlyInterest > 0) {
    // `creditOrder` ya viene de la más cara a la más barata.
    const conInteres = debts.creditOrder.filter((c) => c.monthlyInterest > 0);
    const masCara = conInteres[0];
    out.push({
      id: 'credit-interest',
      tone: debts.creditMonthlyInterest >= 50 ? 'warning' : 'info',
      icon: '📈',
      title: `Pagas ${money(debts.creditMonthlyInterest)} al mes de intereses`,
      body: `Son ${money(debts.creditMonthlyInterest * 12)} al año que no compran nada.`,
      figures: conInteres.slice(0, 4).map((c) => ({ label: c.name, value: alMes(c.monthlyInterest) })),
      ...(conInteres.length > 1 && masCara
        ? { steps: [`Lo que abones de más rinde más en ${masCara.name}: es la que más cobra.`] }
        : {}),
      action: { label: 'Ver mis deudas', kind: 'open_debts' },
    });
  }
}

/**
 * Cómo queda el mes con lo que PIDE.
 *
 * Mide `afterObligations` —ingreso menos pagos fijos, super, otros gastos y los
 * mínimos del banco— y no `available`, que además resta lo que el usuario
 * decidió abonar DE MÁS a sus tarjetas. Con `available`, quien liquidaba un 0 %
 * a tiempo leía «gastas $3,000 más de lo que ingresas» por una decisión suya,
 * no por un gasto.
 *
 * Con ingreso suelto no hay alarma: el plan cuenta solo lo cobrado, y a mitad
 * de mes «falta» quiere decir «faltan cheques por llegar». Eso lo dice «Tu mes»
 * como «faltan por cobrar»; aquí sería un susto garantizado cada quincena.
 */
function adviceForCashFlow(cash: CashFlow, goals: readonly GoalProjection[], out: Advice[]): void {
  // Sin ingresos no se emite consejo: la cabecera ya pide lo mismo con su botón
  // «Ingresos», que se vuelve la acción principal justo en este caso.
  if (cash.monthlyIncome <= 0 || cash.variableIncome) return;

  if (cash.afterObligations < 0) {
    const falta = Math.abs(cash.afterObligations);
    const paradas = goals.filter(aceptaAportes).map((g) => g.name);
    const figures: AdviceFigure[] = [{ label: 'Entra', value: money(cash.monthlyIncome) }];
    if (cash.fixedPayments > 0) figures.push({ label: 'Pagos fijos', value: money(cash.fixedPayments) });
    if (cash.groceriesEstimate > 0) figures.push({ label: 'Super', value: money(cash.groceriesEstimate) });
    if (cash.otherExpenses > 0) figures.push({ label: 'Fuera del super', value: money(cash.otherExpenses) });
    if (cash.creditMinimums > 0) figures.push({ label: 'Mínimos de tarjetas y créditos', value: money(cash.creditMinimums) });
    figures.push({ label: 'Falta', value: money(falta) });

    out.push({
      id: 'negative-flow',
      tone: 'critical',
      icon: '⚖️',
      title: `Este mes sale ${money(falta)} más de lo que entra`,
      body: 'Lo que pide el mes ya pasa de tu ingreso, antes de cualquier meta.',
      figures,
      ...(paradas.length > 0
        ? { steps: [`Mientras tanto, ${enumerate(paradas)} no ${paradas.length === 1 ? 'recibe' : 'reciben'} nada.`] }
        : {}),
      action: { label: 'Revisar pagos fijos', kind: 'open_payments' },
    });
    return;
  }

  // El mes se cubre, pero lo que el usuario abona de más a sus tarjetas no
  // cabe en lo que queda. No es un gasto descontrolado: es un plan que pide
  // más de lo que hay, y se arregla en Deudas.
  if (cash.available < 0) {
    const falta = Math.abs(cash.available);
    out.push({
      id: 'plan-exceeds-month',
      tone: 'warning',
      icon: '💳',
      title: `Tus abonos de más a tarjetas pasan el mes por ${money(falta)}`,
      body: `Cubierto lo que pide el mes quedan ${money(cash.afterObligations)}, y tu plan abona ${money(cash.creditPlanExtra)}.`,
      figures: [
        { label: 'Libre tras lo que pide el mes', value: money(cash.afterObligations) },
        { label: 'Abonos de más a tarjetas', value: money(cash.creditPlanExtra) },
        { label: 'Falta', value: money(falta) },
      ],
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
  const cifras: AdviceFigure[] = [
    { label: 'Factura', value: alMes(r.income) },
    { label: 'Gasta', value: alMes(r.expenses) },
  ];

  if (r.expensesWithoutIncome) {
    out.push({
      id: 'business-no-income',
      tone: 'warning',
      icon: '🏢',
      title: `Tu negocio gasta ${alMes(r.expenses)} sin ingresos cargados`,
      body: 'Sin su facturación, ese gasto sale de tu bolsillo en el plan.',
      action: { label: 'Agregar ingreso', kind: 'add_income' },
    });
    return;
  }

  if (r.result < 0) {
    out.push({
      id: 'business-loss',
      tone: 'critical',
      icon: '📉',
      title: `Tu negocio pierde ${alMes(Math.abs(r.result))}`,
      body: 'Esa diferencia sale de tu dinero personal.',
      figures: cifras,
    });
  } else if (r.income > 0) {
    out.push({
      id: 'business-result',
      tone: 'good',
      icon: '🏢',
      title: `Tu negocio deja ${alMes(r.result)}`,
      body: `Un margen del ${r.margin.toFixed(0)} %.`,
      figures: cifras,
    });
  }
}

/**
 * Una meta que no llega a tiempo, dicha por su CAUSA: la cuota de su tarjeta es
 * corta, otra meta se lleva el dinero, o recibe menos de lo que pide.
 *
 * Cuando el plan no puede apartar nada para ninguna meta no se dice aquí: es un
 * hecho del mes, no de cada meta, y una tarjeta por meta con el mismo párrafo
 * era lo que hacía ilegible al consejero. Lo cuentan «Tu mes» y la tarjeta de
 * cada meta.
 */
function adviceForGoalAtRisk(goal: GoalProjection, cash: CashFlow, input: PlanInput, out: Advice[]): void {
  // Sin ingresos lo cuenta UNA tarjeta para todas (`goals-need-income`).
  if (cash.monthlyIncome <= 0) return;

  const fecha = goal.targetDate ? prettyDate(goal.targetDate) : null;
  const base = {
    id: `goal-risk-${goal.goalId}`,
    topic: 'goals' as const,
    tone: 'warning' as const,
    icon: '⚠️',
  };

  // La de una tarjeta se paga con la cuota de la tarjeta, no con el dinero
  // libre: si no llega es la CUOTA la que es corta, y esa se cambia en Deudas.
  if (goal.cuotaTarjeta !== null) {
    if (goal.shortfallMonthly < 1) return;
    out.push({
      ...base,
      title: `${goal.name}: la cuota no llega a tiempo`,
      body: `Le faltan ${alMes(goal.shortfallMonthly)} para terminar${fecha ? ` el ${fecha}` : ''}.`,
      figures: [
        { label: 'Faltan', value: money(goal.remaining) },
        { label: 'Cuota de la tarjeta', value: alMes(goal.cuotaTarjeta) },
        { label: 'Hace falta', value: alMes(goal.requiredMonthly) },
      ],
      action: { label: 'Ver la tarjeta', kind: 'open_debts' },
    });
    return;
  }

  if (cash.goalsBudget <= 0) return;

  if (goal.allocatedMonthly <= 0) {
    out.push({
      ...base,
      title: `${goal.name} no recibe nada este mes`,
      body: 'Tus otras metas se reparten antes todo lo libre.',
      figures: [
        { label: 'Libre para metas', value: alMes(cash.goalsBudget) },
        { label: 'Esta necesita', value: alMes(goal.requiredMonthly) },
      ],
      steps: ['Súbele la prioridad, o pausa otra y su parte pasa a esta.'],
      action: { label: 'Ajustar meta', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  const falta = goal.shortfallMonthly;
  const steps: string[] = [];
  if (goal.projectedDate) {
    steps.push(`Muévela al ${prettyDate(goal.projectedDate)} y llega sin tocar nada más.`);
  }
  const recorteSuper = input.groceriesMonthly > 0 ? falta / input.groceriesMonthly : 0;
  if (recorteSuper > 0 && recorteSuper <= 0.35) {
    steps.push(`O recorta el super un ${Math.ceil(recorteSuper * 100)} %: sale justo lo que falta.`);
  }
  // Bajar el objetivo solo se ofrece si la cifra reducida significa algo: con
  // nada asignado salía «bájala a $0», que no es una opción.
  const alcanzable = goal.savedAmount + goal.allocatedMonthly * (goal.monthsLeft ?? 1);
  if (alcanzable > 0 && alcanzable < goal.targetAmount) {
    steps.push(`O baja el objetivo a ${money(alcanzable)}, que sí juntas a tiempo.`);
  }

  out.push({
    ...base,
    title: `${goal.name} no llega a tiempo`,
    body: `Recibe ${alMes(goal.allocatedMonthly)} y necesita ${alMes(goal.requiredMonthly)}.`,
    figures: [
      { label: 'Faltan', value: money(goal.remaining) },
      ...(fecha ? [{ label: 'Para el', value: fecha }] : []),
      { label: 'Recibe', value: alMes(goal.allocatedMonthly) },
      { label: 'Necesita', value: alMes(goal.requiredMonthly) },
    ],
    steps,
    action: { label: 'Ajustar meta', kind: 'edit_goal', goalId: goal.goalId },
  });
}

/**
 * Lo que cada meta tiene que decir. La que va en camino no dice nada: su
 * tarjeta en «Tus metas» ya lo enseña con su barra, y repetirlo aquí era ruido
 * que empujaba lo importante fuera de la vista.
 */
function adviceForGoal(
  goal: GoalProjection,
  cash: CashFlow,
  input: PlanInput,
  promosAvisadas: ReadonlySet<string>,
  out: Advice[],
): void {
  const fecha = goal.targetDate ? prettyDate(goal.targetDate) : null;

  if (goal.feasibility === 'done') {
    // La enganchada a una deuda se da por lograda sola (`projectGoal`): aquí
    // solo llegan las de ahorro, que sí hay que marcar.
    out.push({
      id: `goal-done-${goal.goalId}`,
      topic: 'goals',
      tone: 'good',
      icon: '🎉',
      title: `¡${goal.name} está cubierta!`,
      body: 'Márcala como lograda y su parte pasa a tus otras metas.',
      figures: [
        { label: 'Juntado', value: money(goal.savedAmount) },
        { label: 'Objetivo', value: money(goal.targetAmount) },
      ],
      action: { label: 'Marcar lograda', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'overdue') {
    // Sin ritmo asignado no se puede prometer una fecha: «al ritmo de $0 la
    // lograrías…» era una frase que se contradecía sola.
    const nueva = goal.allocatedMonthly > 0 && goal.projectedDate ? prettyDate(goal.projectedDate) : null;
    out.push({
      id: `goal-overdue-${goal.goalId}`,
      topic: 'goals',
      tone: 'warning',
      icon: '📅',
      title: `${goal.name}: la fecha ya pasó`,
      body: nueva ? `Al ritmo de hoy llega el ${nueva}.` : 'Ahora no recibe nada, así que no hay fecha nueva que prometer.',
      figures: [
        ...(fecha ? [{ label: 'Era para el', value: fecha }] : []),
        { label: 'Faltan', value: money(goal.remaining) },
        ...(goal.allocatedMonthly > 0 ? [{ label: 'Recibe', value: alMes(goal.allocatedMonthly) }] : []),
      ],
      action: { label: 'Ajustar fecha', kind: 'edit_goal', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'at_risk') {
    // La tarjeta cuyo 0 % se acaba ya tiene su aviso, con la cuota que hace
    // falta: «la cuota no llega» sería el mismo hecho dicho dos veces.
    if (goal.debtId && promosAvisadas.has(goal.debtId)) return;
    adviceForGoalAtRisk(goal, cash, input, out);
    return;
  }

  if (goal.feasibility === 'tight') {
    out.push({
      id: `goal-tight-${goal.goalId}`,
      topic: 'goals',
      tone: 'idea',
      icon: '🎯',
      title: `${goal.name} va justa`,
      body: `Se lleva ${money(goal.requiredMonthly)} de los ${money(cash.goalsBudget)} libres al mes.`,
      figures: [
        ...(fecha ? [{ label: 'Para el', value: fecha }] : []),
        { label: 'Necesita', value: alMes(goal.requiredMonthly) },
        { label: 'Por semana', value: money(goal.requiredWeekly) },
      ],
      steps: ['Un imprevisto la descarrila: apartar cada semana aguanta mejor que esperar al fin de mes.'],
      action: { label: 'Registrar aporte', kind: 'contribute', goalId: goal.goalId },
    });
    return;
  }

  if (goal.feasibility === 'no_date') {
    out.push({
      id: `goal-nodate-${goal.goalId}`,
      topic: 'goals',
      tone: 'info',
      icon: '🗓️',
      title: `Ponle fecha a ${goal.name}`,
      body: goal.projectedDate
        ? `Al ritmo de hoy llegaría el ${prettyDate(goal.projectedDate)}.`
        : 'Sin fecha no hay ritmo que seguir.',
      action: { label: 'Poner fecha', kind: 'edit_goal', goalId: goal.goalId },
    });
  }
}

/**
 * Todas las metas paradas por la misma razón: no hay ingresos cargados.
 *
 * Una sola tarjeta y no una por meta: con dos metas salían dos avisos idénticos
 * repitiendo el mismo «$0» sin decir de dónde venía.
 *
 * NO lleva acción a propósito: la cabecera ya convierte «Ingresos» en su botón
 * principal justo en este caso, y pedir el dato por segunda vez a media
 * pantalla de distancia es la duplicación que esa decisión evitaba.
 */
function adviceForStalledGoals(cash: CashFlow, goals: readonly GoalProjection[], out: Advice[]): void {
  if (cash.monthlyIncome > 0) return;

  const paradas = goals.filter((g) => g.status === 'active' && g.remaining > 0);
  if (paradas.length === 0) return;

  const total = round2(paradas.reduce((s, g) => s + g.requiredMonthly, 0));
  out.push({
    id: 'goals-need-income',
    topic: 'goals',
    tone: 'warning',
    icon: '⏸️',
    title: paradas.length === 1 ? `${paradas[0].name} está en pausa` : `Tus ${paradas.length} metas están en pausa`,
    body: 'Sin ingresos cargados, el plan no tiene qué repartir.',
    figures: [
      ...paradas.slice(0, 4).map((g) => ({ label: g.name, value: alMes(g.requiredMonthly) })),
      ...(paradas.length > 1 ? [{ label: 'Entre todas', value: alMes(total) }] : []),
    ],
  });
}

function adviceForSurplus(cash: CashFlow, goals: readonly GoalProjection[], out: Advice[]): void {
  if (cash.unallocated <= 1) return;

  const destino = goals.find(aceptaAportes);
  if (!destino) {
    out.push({
      id: 'surplus-no-goals',
      topic: 'goals',
      tone: 'idea',
      icon: '✨',
      title: `Te sobran ${alMes(cash.unallocated)} sin destino`,
      body: 'Dale nombre con una meta, o se va sin que lo notes.',
      action: { label: 'Crear meta', kind: 'add_goal' },
    });
    return;
  }

  const adelanto = monthsSavedWith(destino, cash.unallocated);
  out.push({
    id: 'surplus-boost',
    tone: 'idea',
    icon: '🚀',
    title: `Tienes ${alMes(cash.unallocated)} libres`,
    body: adelanto > 0
      ? `Mandándolos a ${destino.name} llega ${meses(adelanto)} antes.`
      : `Puedes mandarlos a ${destino.name}.`,
    action: { label: 'Registrar aporte', kind: 'contribute', goalId: destino.goalId },
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

/**
 * Un ahorro mensual dicho como avance de la primera meta que acepta dinero.
 *
 * Solo metas de ahorro: antes salía «son $20 más al mes para» la meta de una
 * tarjeta, que lee su avance de la deuda y no se movería con ese dinero.
 */
function impactOnGoal(goals: readonly GoalProjection[], extra: number): string | null {
  const destino = goals.find(aceptaAportes);
  if (!destino || extra <= 0) return null;
  const adelanto = monthsSavedWith(destino, extra);
  return adelanto > 0
    ? `Mandándolos a ${destino.name} llega ${meses(adelanto)} antes.`
    : `Son ${alMes(extra)} más para ${destino.name}.`;
}

/** Antes de una semana de mes, el ritmo del super es una adivinanza. */
const RITMO_FIABLE_DESDE_DIA = 7;
/** Pasarse del límite por menos de esto es ruido: $10, o el 10 % del límite. */
const EXCESO_DE_SUPER_MINIMO = 10;
const EXCESO_DE_SUPER_PCT = 0.1;

/**
 * El super, solo cuando hay algo que hacer con él.
 *
 * El ritmo, la proyección, el límite y la tendencia ya los enseña la tarjeta
 * «Super», cifra por cifra. Repetirlos aquí con otras palabras —«vas a cerrar
 * en», «va un 50 % arriba», «vas por debajo»— era la mitad del ruido del
 * consejero. Quedan el aviso de pasarse del límite cuando el exceso pesa, y dos
 * ideas para liberar dinero cuando hay una meta que lo necesita.
 */
function adviceForGroceries(
  input: PlanInput,
  cash: CashFlow,
  goals: readonly GoalProjection[],
  out: Advice[],
): void {
  const g = input.groceries;

  if (!g || (g.monthsWithData === 0 && g.spentThisMonth === 0)) {
    // Sin ingresos el consejo prioritario es otro; no saturar el arranque.
    if (cash.monthlyIncome <= 0) return;
    out.push({
      id: 'grocery-no-purchases',
      tone: 'info',
      icon: '🧾',
      title: 'Registra tus compras y el plan se afina solo',
      body: 'Mientras no haya tickets, el super se estima con tu límite.',
      action: { label: 'Ir a Presupuesto', kind: 'open_budget' },
    });
    return;
  }

  const ritmoFiable = g.daysElapsed >= RITMO_FIABLE_DESDE_DIA;
  const umbral = Math.max(EXCESO_DE_SUPER_MINIMO, g.limit * EXCESO_DE_SUPER_PCT);
  if (ritmoFiable && g.limit > 0 && g.overLimit >= umbral) {
    const impacto = impactOnGoal(goals, g.overLimit);
    out.push({
      id: 'grocery-pace-over-limit',
      tone: 'warning',
      icon: '🛒',
      title: `El super va camino de ${money(g.projectedMonthEnd)}`,
      body: `Tu límite es ${money(g.limit)}: te pasarías ${money(g.overLimit)}.`,
      figures: [
        { label: `Llevas en ${g.daysElapsed} días`, value: money(g.spentThisMonth) },
        { label: 'A este ritmo', value: money(g.projectedMonthEnd) },
        { label: 'Tu límite', value: money(g.limit) },
      ],
      ...(impacto ? { steps: [`Quedarte en el límite te deja esos ${money(g.overLimit)}. ${impacto}`] } : {}),
      action: { label: 'Ver presupuesto', kind: 'open_budget' },
    });
  }

  // Las dos ideas solo cuando una meta necesita aire: sin eso, recortar el
  // super es un consejo que nadie pidió.
  const enRiesgo = goals.some(
    (p) => p.status === 'active' && (p.feasibility === 'at_risk' || p.feasibility === 'tight'),
  );
  if (!enRiesgo) return;

  const top = g.categories[0];
  if (top && top.share >= 20 && top.currentMonth > 0) {
    const recorte = top.currentMonth * 0.15;
    const impacto = impactOnGoal(goals, recorte);
    out.push({
      id: 'grocery-category-lever',
      tone: 'idea',
      icon: '🥑',
      title: `${top.category} se lleva el ${Math.round(top.share)} % de tu super`,
      body: `Un 15 % menos ahí libera ${alMes(recorte)}.`,
      figures: [
        { label: 'Este mes', value: money(top.currentMonth) },
        { label: 'Un 15 % menos, en un año', value: money(recorte * 12) },
      ],
      steps: ['Marca propia, comprar por peso y mirar la despensa antes de salir.', ...(impacto ? [impacto] : [])],
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
  }

  if (g.tripsThisMonth >= 8 && g.spentThisMonth > 0) {
    out.push({
      id: 'grocery-trip-frequency',
      tone: 'idea',
      icon: '🚗',
      title: `Llevas ${g.tripsThisMonth} visitas al super este mes`,
      body: `Unos ${money(g.spentThisMonth / g.tripsThisMonth)} cada una: juntarlas en una por semana suele bajar el total.`,
      action: { label: 'Ver mis compras', kind: 'open_trips' },
    });
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
  const now = input.now ?? new Date();
  const active = goals.filter((g) => g.status === 'active');

  // Lo primero: si hay dinero contado dos veces, el resto de consejos están
  // calculados sobre una cifra equivocada y conviene decirlo antes que nada.
  adviceForDuplicates(input, out);
  adviceForOverdue(debts, out);
  const promosAvisadas = adviceForPromos(input.credits ?? [], now, out);
  adviceForCredits(debts, out);
  adviceForCashFlow(cash, active, out);
  if (scopes) adviceForScopes(scopes, out);
  for (const goal of active) adviceForGoal(goal, cash, input, promosAvisadas, out);
  adviceForStalledGoals(cash, goals, out);
  adviceForGroceries(input, cash, active, out);
  adviceForSurplus(cash, active, out);

  // `sort` es estable: dentro del mismo tono se queda el orden de arriba.
  return out.sort((a, b) => TONE_WEIGHT[a.tone] - TONE_WEIGHT[b.tone]);
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export function buildFinancePlan(input: PlanInput): FinancePlan {
  const now = input.now ?? new Date();
  const extraMonthly = Math.max(0, input.extraMonthly ?? 0);

  // El ingreso del mes son DOS cosas: lo que se repite y lo que cayó suelto.
  // Se calculan aparte para poder decirlas aparte, y se suman para lo único
  // que necesita el total: cuánto dinero hay realmente este mes.
  const recurringIncome = totalMonthlyIncome(input.incomes, now);
  const oneTimeIncome = totalOneTimeIncome(input.incomes, now);
  const monthlyIncome = recurringIncome + oneTimeIncome;
  const fixedPayments = input.fixedPayments.reduce((s, p) => s + Math.max(0, p.amount), 0);
  const groceriesEstimate = Math.max(0, input.groceriesMonthly);
  // Comer fuera y la gasolina no son super, pero salen de la misma cuenta el
  // mismo mes. Restarlos aquí es lo que hace que "te queda libre" sea cierto.
  const otherExpenses = Math.max(0, input.otherExpensesMonthly ?? 0);

  // La cuota de una tarjeta o un crédito es dinero comprometido igual que la
  // renta: si no se resta aquí, el plan cree que hay más libre del que hay y
  // promete metas con dinero que ya tiene dueño.
  const credits = input.credits ?? [];
  // La cuota enlazada a un pago mensual ya está dentro de `fixedPayments`:
  // sumarla otra vez es el doble conteo que inflaba el gasto del mes.
  const enElPlan = credits.filter((c) => !isCoveredByPayment(c, input.fixedPayments));
  const creditPayments = enElPlan.reduce((s, c) => s + Math.max(0, c.installment), 0);
  // De cada cuota, lo que exige el banco. Nunca más que la cuota: lo que el
  // plan resta es la cuota, y «lo de más» no puede salir negativo.
  const creditMinimums = enElPlan.reduce((s, c) => s + minimoExigido(c), 0);
  const creditPlanExtra = Math.max(0, creditPayments - creditMinimums);

  const afterObligations =
    monthlyIncome - fixedPayments - groceriesEstimate - otherExpenses - creditMinimums + extraMonthly;
  const available =
    monthlyIncome - fixedPayments - groceriesEstimate - otherExpenses - creditPayments + extraMonthly;

  const debts = buildDebtOverview(input.fixedPayments, input.goals, credits, available);
  const goalsBudget = Math.max(0, available - debts.monthlyCatchUp);

  const projections = input.goals.map((g) => projectGoal(g, now)).sort(compareGoals);
  // Una meta enlazada a una tarjeta del plan se paga con la cuota de esa
  // tarjeta (ver `cuotaTarjeta`).
  const cuotaDe = new Map(credits.map((c) => [c.id, Math.max(0, c.installment)]));
  for (const p of projections) {
    const cuota = p.debtId ? cuotaDe.get(p.debtId) : undefined;
    if (cuota === undefined) continue;
    p.cuotaTarjeta = round2(cuota);
    // Una tarjeta se paga una vez al MES, así que lo que hace falta se cuenta
    // en cuotas que caben hasta la fecha —como cuenta el motor de deudas su
    // estrategia «antes de una fecha»—, no en meses con decimales. Con
    // decimales, diez semanas eran 2.3 meses: la cuota que el motor calculó para
    // llegar a tiempo en tres pagos salía «corta» por un tercio, y el
    // consejero decía «la cuota no llega» de la cuota hecha para llegar.
    if (p.remaining > 0 && p.targetDate && p.daysLeft !== null && p.daysLeft >= 0) {
      p.requiredMonthly = round2(p.remaining / monthsUntilDate(p.targetDate, now));
    }
  }
  const overrides = new Map(input.goals.map((g) => [g.id, g.monthlyOverride]));
  const unallocated = allocate(projections, goalsBudget, overrides);
  for (const p of projections) finishProjection(p, now, goalsBudget);

  // Lo que sale del dinero libre hacia metas: sin las cuotas de tarjeta, que
  // ya están restadas como crédito.
  const allocatedToGoals = round2(
    projections.reduce((s, p) => s + (p.cuotaTarjeta === null ? p.allocatedMonthly : 0), 0),
  );

  const cashFlow: CashFlow = {
    monthlyIncome: round2(monthlyIncome),
    recurringIncome: round2(recurringIncome),
    oneTimeIncome: round2(oneTimeIncome),
    fixedPayments: round2(fixedPayments),
    groceriesEstimate: round2(groceriesEstimate),
    otherExpenses: round2(otherExpenses),
    creditPayments: round2(creditPayments),
    creditMinimums: round2(creditMinimums),
    creditPlanExtra: round2(creditPlanExtra),
    afterObligations: round2(afterObligations),
    available: round2(available),
    debtCatchUp: debts.monthlyCatchUp,
    goalsBudget: round2(goalsBudget),
    allocatedToGoals,
    unallocated: round2(Math.max(0, unallocated)),
    savingsRate: monthlyIncome > 0 ? round2(clamp(afterObligations / monthlyIncome, -10, 1)) : 0,
    extraMonthly: round2(extraMonthly),
    variableIncome: oneTimeIncome > 0,
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
