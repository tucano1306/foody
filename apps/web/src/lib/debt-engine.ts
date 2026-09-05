/**
 * debt-engine.ts — el cerebro de Deudas y Créditos.
 *
 * Funciones PURAS (sin SQL, sin `new Date()` implícito fuera de `now`) que
 * reproducen la aritmética con la que un banco lleva un crédito:
 *
 *   1. El saldo genera interés cada ciclo:  interés = saldo × tasa mensual.
 *   2. Un pago se reparte en cascada:       comisiones → interés → capital.
 *   3. Solo lo que toca el CAPITAL baja la deuda. Si la cuota no cubre ni el
 *      interés, el saldo crece: es la trampa del "pago mínimo" y el motor la
 *      detecta y la nombra en vez de dejar que el usuario la descubra tarde.
 *
 * Todo el dinero entra y sale redondeado a 2 decimales; internamente se opera
 * en flotante y solo se redondea al salir, para no arrastrar error.
 *
 * Se prueba en debt-engine.test.ts; la capa de datos vive en debt-data.ts.
 */

// ─── Tipos de dominio ─────────────────────────────────────────────────────────

/** Cómo escribió el usuario la tasa que le cobran. */
export type RatePeriod =
  /** 3 = 3 % mensual (lo más común en tarjetas de LatAm). */
  | 'monthly'
  /** 36 = 36 % anual nominal → se divide entre 12. */
  | 'annual_nominal'
  /** 42.58 = 42.58 % anual efectivo (TEA) → se desanualiza con raíz 12. */
  | 'annual_effective';

export type DebtKind =
  | 'credit_card'
  | 'loan'
  | 'personal'
  | 'mortgage'
  | 'auto'
  | 'store'
  | 'other';

/** Con qué criterio decide el usuario cuánto abonar cada mes. */
export type PayoffStrategy =
  /** Cuota fija a N meses (sistema francés) — el clásico crédito bancario. */
  | 'fixed_installment'
  /**
   * Pagada antes de una FECHA concreta.
   *
   * No es lo mismo que la cuota fija: aquí lo pactado es el día, no el importe.
   * La cuota se recalcula cada mes con los meses que QUEDAN, así que si un mes
   * se abona de menos, al siguiente sube sola. Es el caso de la tarjeta que hay
   * que liquidar antes de que empiecen a cobrar intereses.
   */
  | 'by_date'
  /** Pago mínimo de tarjeta: % del saldo (con piso), nunca menos que el interés. */
  | 'minimum'
  /** Solo intereses: el saldo NO baja jamás. */
  | 'interest_only'
  /** Un monto fijo que el usuario elige a mano. */
  | 'custom';

export type DebtStatus = 'active' | 'paid_off' | 'archived';

/** Cada línea del libro mayor. El saldo siempre se deriva de estas. */
export type MovementKind =
  /** Consumo/desembolso nuevo: sube el saldo. */
  | 'charge'
  /** Abono del usuario: baja el saldo. */
  | 'payment'
  /** Interés devengado del ciclo: sube el saldo. */
  | 'interest'
  /** Comisión, mora, anualidad: sube el saldo. */
  | 'fee'
  /** Corrección manual: sube o baja (puede ser negativa). */
  | 'adjustment';

/** Qué tan sana está la deuda con la cuota actual. */
export type ProjectionStatus =
  /** Ya no se debe nada. */
  | 'paid'
  /** Se liquida en un plazo razonable. */
  | 'healthy'
  /** Se paga, pero el interés se lleva una tajada enorme. */
  | 'slow'
  /** Casi todo el abono es interés: el capital apenas se mueve. */
  | 'stagnant'
  /** La cuota no cubre ni el interés: la deuda crece para siempre. */
  | 'never';

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Tope de seguridad al iterar meses: 50 años. */
export const MAX_SCHEDULE_MONTHS = 600;

/** Tope de ciclos de interés que se devengan de una sola vez (10 años). */
const MAX_ACCRUAL_PERIODS = 120;

/** Pago mínimo típico de tarjeta cuando el usuario no especifica: 5 % del saldo. */
export const DEFAULT_MIN_PERCENT = 5;

/** Por debajo de este saldo la deuda se considera liquidada (ruido de centavos). */
const DUST = 0.005;

// ─── Utilidades numéricas ─────────────────────────────────────────────────────

/** Redondeo a centavos, estable frente al error de flotante. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Redondeo al alza al centavo. Las cuotas se redondean SIEMPRE hacia arriba,
 * como hace cualquier banco: así el plazo pactado se cumple exacto y la última
 * cuota queda unos centavos por debajo, en vez de aparecer una cuota extra de
 * $0.40 al final que descuadra la tabla.
 */
function ceilCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil((n - Number.EPSILON) * 100) / 100;
}

/**
 * Redondeo a la baja al centavo. Se usa solo en la cuota de "solo intereses":
 * ahí el redondeo NO puede pasarse del interés real, o la deuda amortizaría por
 * accidente unos centavos y el motor dejaría de llamar a la trampa por su
 * nombre.
 */
function floorCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n + Number.EPSILON) * 100) / 100;
}

/** Convierte cualquier entrada del usuario en un número finito y no negativo. */
export function safeAmount(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

// ─── Tasas ────────────────────────────────────────────────────────────────────

/**
 * Tasa mensual efectiva en tanto por uno (3 % mensual → 0.03).
 *
 * Es la única tasa con la que opera el motor: todo lo demás se convierte aquí,
 * de modo que comparar una tarjeta al 3 % mensual con un crédito al 24 % anual
 * sea una comparación honesta y no una de peras con manzanas.
 */
export function toMonthlyRate(rate: number, period: RatePeriod): number {
  const r = Number.isFinite(rate) ? Math.max(0, rate) / 100 : 0;
  if (r === 0) return 0;
  switch (period) {
    case 'monthly':
      return r;
    case 'annual_nominal':
      return r / 12;
    case 'annual_effective':
      return (1 + r) ** (1 / 12) - 1;
  }
}

/** Tasa anual efectiva (TEA) que resulta de capitalizar la mensual 12 veces. */
export function toAnnualEffectiveRate(monthlyRate: number): number {
  if (monthlyRate <= 0) return 0;
  return (1 + monthlyRate) ** 12 - 1;
}

/** Interés de un ciclo sobre un saldo dado. */
export function monthlyInterestOf(balance: number, monthlyRate: number): number {
  if (balance <= 0 || monthlyRate <= 0) return 0;
  return balance * monthlyRate;
}

/**
 * El interés de un ciclo TAL COMO lo cobra una tarjeta: tasa diaria por los
 * días que duró el ciclo.
 *
 * Las tarjetas no dividen la tasa anual entre doce: la dividen entre 365 y la
 * multiplican por los días del período de facturación, que no todos los meses
 * son los mismos. Con un ciclo de 31 días la diferencia se ve:
 *
 *   23,74 % / 365 × 31 × $1.186,97 = $23,93   ← lo que cobró el banco
 *   23,74 % / 12       × $1.186,97 = $23,48   ← lo que calculaba la app
 *
 * Se usa solo para la cifra del mes en curso, que es la que el usuario compara
 * contra su estado de cuenta. La proyección a futuro sigue en meses: no se sabe
 * cuántos días tendrá cada ciclo del año que viene, y a la larga las dos formas
 * convergen (365/12 = 30,4 días de media).
 */
export function cycleInterestOf(balance: number, annualRate: number, cycleDays: number): number {
  if (balance <= 0 || annualRate <= 0 || cycleDays <= 0) return 0;
  return balance * (annualRate / 100 / 365) * cycleDays;
}

/**
 * Cuántas cuotas más caben todavía dentro de la promoción.
 *
 * Se cuenta por ciclos y no por días porque el interés se cobra por ciclo: lo
 * que decide si llegas es cuántas cuotas más caben, no cuántas noches faltan.
 *
 * Con `dueDay` se cuentan los VENCIMIENTOS que quedan, que es lo que de verdad
 * son esas cuotas. Contando meses completos desde hoy, el resultado dependía
 * del día en que uno mirase la pantalla: la 6791 vence el 24 y su promo muere
 * el 27/09/2027, así que caben trece pagos —el último, tres días antes— pero
 * mirándola un 30 de agosto salían doce, y la app avisaba de un descubierto de
 * $480 que no existe. Sin `dueDay` no hay nada mejor que los meses completos.
 */
export function promoMonthsLeft(
  promoEndsOn: string,
  now: Date = new Date(),
  dueDay?: number | null,
): number {
  const m = promoEndsOn.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (end <= hoy) return 0;

  if (dueDay != null && dueDay >= 1 && dueDay <= 31) {
    return dueDatesUntil(end, hoy, Math.trunc(dueDay)).count;
  }

  const meses =
    (end.getFullYear() - hoy.getFullYear()) * 12 + (end.getMonth() - hoy.getMonth());
  // El mes en curso solo cuenta si el día de vencimiento aún no ha pasado.
  return Math.max(0, end.getDate() >= hoy.getDate() ? meses : meses - 1);
}

/**
 * El día en que cae la última cuota que todavía entra en la promoción.
 *
 * Es lo que hace comprobable un «vas bien»: entre esa fecha y el fin de la
 * promoción está TODO el margen que hay, y a veces son tres días — o ninguno,
 * cuando el vencimiento cae justo el día en que el 0 % muere.
 */
export function promoLastDueDate(
  promoEndsOn: string,
  now: Date = new Date(),
  dueDay?: number | null,
): string | null {
  if (dueDay == null || dueDay < 1 || dueDay > 31) return null;
  const m = promoEndsOn.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (end <= hoy) return null;

  const { last } = dueDatesUntil(end, hoy, Math.trunc(dueDay));
  return last ? toDateKey(last) : null;
}

/** El vencimiento de ese mes, recortado en los meses que no llegan al día. */
function onDueDay(year: number, month: number, dueDay: number): Date {
  // new Date(y, m, 0) da el último día del mes anterior, así que `month + 1`
  // cuenta los días de `month`. El desbordamiento se normaliza solo: el mes 12
  // es enero del año siguiente.
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dueDay, daysInMonth));
}

/** Vencimientos entre hoy (incluido, si aún no ha pasado) y `end` (incluido). */
function dueDatesUntil(end: Date, hoy: Date, dueDay: number): { count: number; last: Date | null } {
  const year = hoy.getFullYear();
  let month = hoy.getMonth();
  // El de este mes cuenta si todavía no ha pasado; si ya pasó, se empieza por
  // el del mes que viene.
  if (onDueDay(year, month, dueDay) < hoy) month += 1;

  let count = 0;
  let last: Date | null = null;
  while (count < MAX_SCHEDULE_MONTHS) {
    const due = onDueDay(year, month, dueDay);
    if (due > end) break;
    count += 1;
    last = due;
    month += 1;
  }
  return { count, last };
}

/**
 * ¿Se le paso el dia de pago a esta deuda sin que entrara un abono?
 *
 * En Pagos este estado existe desde hace meses; en Deudas no habia forma de
 * leerlo, porque `daysUntilDue` NUNCA es negativo: pasado el dia, rueda al mes
 * siguiente. Asi que «atrasada» se deriva del libro mayor, igual que Pagos
 * deriva su `isPaidThisMonth`.
 *
 * Las tres condiciones hacen falta a la vez. Sin la del abono, todas las
 * tarjetas con saldo pareceerian atrasadas el mes entero, y un aviso que
 * siempre esta encendido no avisa de nada.
 *
 * El dia se recorta a los del mes: un vencimiento el 31 vence el 28 en
 * febrero. Sin recortarlo, esa deuda no se atrasaria jamas en febrero.
 */
export function isDebtOverdue(
  debt: { currentBalance: number; dueDay: number },
  paidThisMonth: number,
  now: Date = new Date(),
): boolean {
  if (safeAmount(debt.currentBalance) <= 0) return false;
  if (safeAmount(paidThisMonth) > 0) return false;
  const diasDelMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() > Math.min(Math.trunc(debt.dueDay), diasDelMes);
}

// ─── Cuotas ───────────────────────────────────────────────────────────────────

/**
 * Cuota fija del sistema francés (la de cualquier crédito a plazo):
 *
 *     cuota = P · i / (1 − (1 + i)^−n)
 *
 * Con tasa 0 degenera al reparto lineal P/n, que es justo lo que debe pasar.
 */
export function frenchInstallment(principal: number, monthlyRate: number, months: number): number {
  const p = safeAmount(principal);
  const n = Math.trunc(months);
  if (p <= 0 || n <= 0) return 0;
  if (monthlyRate <= 0) return ceilCents(p / n);
  const factor = (1 + monthlyRate) ** -n;
  return ceilCents((p * monthlyRate) / (1 - factor));
}

/**
 * Plazo (en meses enteros) para liquidar un saldo abonando `payment` cada mes.
 *
 *     n = −ln(1 − saldo·i / cuota) / ln(1 + i)
 *
 * Devuelve `null` cuando la cuota no alcanza a cubrir el interés del ciclo:
 * ahí la deuda no se extingue nunca y decirlo importa más que dar un número.
 */
export function monthsToPayoff(balance: number, monthlyRate: number, payment: number): number | null {
  const b = safeAmount(balance);
  const pay = safeAmount(payment);
  if (b <= DUST) return 0;
  if (pay <= 0) return null;
  if (monthlyRate <= 0) return Math.ceil(b / pay);

  const interest = b * monthlyRate;
  // La cuota debe superar el interés aunque sea por un centavo; si lo iguala,
  // el saldo se congela para siempre.
  if (pay <= interest + 1e-9) return null;

  const n = -Math.log(1 - (b * monthlyRate) / pay) / Math.log(1 + monthlyRate);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.ceil(n - 1e-9), MAX_SCHEDULE_MONTHS);
}

/**
 * Cuota mínima que un banco exige en una tarjeta:
 * `max(saldo × %, piso)` y, por encima de eso, nunca menos que el interés del
 * ciclo (ningún emisor deja que el saldo crezca por diseño).
 */
export function minimumPayment(
  balance: number,
  monthlyRate: number,
  percent: number = DEFAULT_MIN_PERCENT,
  floor = 0,
): number {
  const b = safeAmount(balance);
  if (b <= DUST) return 0;
  const pct = Math.max(0, Number.isFinite(percent) ? percent : DEFAULT_MIN_PERCENT) / 100;
  const byPercent = b * pct;
  const interest = monthlyInterestOf(b, monthlyRate);
  // El mínimo cubre el interés + algo de capital; si el % se queda corto, se
  // eleva al interés para que al menos no crezca.
  const raw = ceilCents(Math.max(byPercent, safeAmount(floor), interest));
  // Nunca se exige más de lo que realmente se debe con su interés.
  return round2(Math.min(raw, b + interest));
}

/**
 * La cuota más pequeña que SÍ amortiza: interés del ciclo + un centavo.
 * Es el número que convierte "estoy pagando y no baja" en una acción concreta.
 */
export function breakEvenPayment(balance: number, monthlyRate: number): number {
  const interest = monthlyInterestOf(safeAmount(balance), monthlyRate);
  if (interest <= 0) return 0;
  return round2(interest + 0.01);
}

// ─── Reparto de un pago (cascada del banco) ───────────────────────────────────

export interface AllocationInput {
  /** Capital que se debe antes de aplicar el pago. */
  balance: number;
  /** Interés ya devengado y pendiente de cobro. */
  accruedInterest?: number;
  /** Comisiones/moras pendientes. */
  pendingFees?: number;
  /** Lo que el usuario está abonando. */
  payment: number;
}

export interface PaymentSplit {
  /** Cuánto del abono se fue en comisiones. */
  fees: number;
  /** Cuánto se fue en intereses. */
  interest: number;
  /** Cuánto bajó realmente la deuda. */
  principal: number;
  /** Sobrante si el usuario pagó más de lo que debía. */
  overpayment: number;
  /** Interés que queda sin cubrir (el pago no alcanzó). */
  unpaidInterest: number;
  /** Comisiones que quedan sin cubrir. */
  unpaidFees: number;
  /** Deuda total después del pago (capital + interés y comisiones no cubiertos). */
  remainingBalance: number;
  /** true si el abono no alcanzó a tocar el capital. */
  touchedPrincipal: boolean;
}

/**
 * Reparte un abono con la MISMA prelación que usa un banco:
 * comisiones y moras → intereses del período → capital.
 *
 * Ese orden no es un detalle: es exactamente la razón por la que alguien puede
 * pagar durante años y ver el saldo intacto. El resultado se devuelve
 * desglosado para poder enseñarlo en pantalla, no solo para calcularlo.
 */
export function allocatePayment(input: AllocationInput): PaymentSplit {
  const balance = safeAmount(input.balance);
  const accruedInterest = safeAmount(input.accruedInterest);
  const pendingFees = safeAmount(input.pendingFees);
  let left = safeAmount(input.payment);

  const fees = Math.min(left, pendingFees);
  left -= fees;

  const interest = Math.min(left, accruedInterest);
  left -= interest;

  const principal = Math.min(left, balance);
  left -= principal;

  const unpaidFees = pendingFees - fees;
  const unpaidInterest = accruedInterest - interest;
  const remaining = balance - principal + unpaidInterest + unpaidFees;

  return {
    fees: round2(fees),
    interest: round2(interest),
    principal: round2(principal),
    overpayment: round2(left),
    unpaidInterest: round2(unpaidInterest),
    unpaidFees: round2(unpaidFees),
    remainingBalance: round2(Math.max(0, remaining)),
    touchedPrincipal: principal > DUST,
  };
}

// ─── Devengo de intereses entre dos fechas ────────────────────────────────────

export interface AccrualInput {
  balance: number;
  monthlyRate: number;
  /** Última vez que se capitalizó interés. */
  from: Date;
  /** Momento del corte (normalmente "ahora"). */
  to: Date;
}

export interface AccrualResult {
  /** Ciclos mensuales completos transcurridos. */
  periods: number;
  /** Interés total devengado en esos ciclos (compuesto). */
  interest: number;
  /** Saldo después de capitalizar. */
  newBalance: number;
  /** Fecha hasta la que quedó devengado (from + periods meses). */
  accruedThrough: Date;
}

/**
 * Cuenta ciclos mensuales COMPLETOS entre dos fechas.
 *
 * Se cuenta por calendario (no por bloques de 30 días) para que un crédito
 * abierto el día 31 no se desfase: el ciclo cierra el mismo día del mes
 * siguiente, o el último día si ese mes es más corto.
 */
export function completedMonthlyCycles(from: Date, to: Date): number {
  if (!(from instanceof Date) || !(to instanceof Date)) return 0;
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;

  let cycles =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // El mes solo cuenta si ya se alcanzó el día del corte.
  const anniversary = addMonths(from, cycles);
  if (anniversary.getTime() > to.getTime()) cycles -= 1;
  return Math.max(0, Math.min(cycles, MAX_ACCRUAL_PERIODS));
}

/** Suma meses conservando el día, recortado al último día del mes destino. */
export function addMonths(from: Date, months: number): Date {
  const target = new Date(from.getTime());
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, daysInMonth));
  return target;
}

/**
 * Devenga el interés de todos los ciclos completos transcurridos, capitalizando
 * ciclo a ciclo (interés compuesto, como en la vida real).
 */
export function accrueInterest(input: AccrualInput): AccrualResult {
  const balance = safeAmount(input.balance);
  const periods = completedMonthlyCycles(input.from, input.to);
  const accruedThrough = periods > 0 ? addMonths(input.from, periods) : new Date(input.from.getTime());

  if (balance <= DUST || input.monthlyRate <= 0 || periods === 0) {
    return { periods, interest: 0, newBalance: round2(balance), accruedThrough };
  }

  const grown = balance * (1 + input.monthlyRate) ** periods;
  const interest = grown - balance;
  return {
    periods,
    interest: round2(interest),
    newBalance: round2(grown),
    accruedThrough,
  };
}

export interface AccrualCycle {
  /**
   * Mes de cierre del ciclo en formato YYYY-MM.
   *
   * Es la CLAVE DE IDEMPOTENCIA del devengo: el libro mayor tiene un índice
   * único por (deuda, período) para los movimientos de interés, así que aunque
   * dos peticiones simultáneas intenten cobrar el mismo mes, solo una entra.
   * Sin esto, dos pestañas abiertas duplicarían intereses.
   */
  periodKey: string;
  openingBalance: number;
  interest: number;
  closingBalance: number;
  /** Fecha de corte del ciclo. */
  closedAt: Date;
}

/** Mes de una fecha en formato YYYY-MM (hora local). */
export function toPeriodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Desglosa el devengo en un movimiento por ciclo, capitalizando uno sobre otro.
 *
 * Se prefiere esto a un solo apunte gordo porque en el libro mayor el usuario
 * lee "Interés de julio" e "Interés de agosto" por separado, que es como se lee
 * un estado de cuenta de verdad.
 */
export function accrualCycles(input: AccrualInput): AccrualCycle[] {
  const periods = completedMonthlyCycles(input.from, input.to);
  let balance = safeAmount(input.balance);
  if (periods === 0 || balance <= DUST || input.monthlyRate <= 0) return [];

  const cycles: AccrualCycle[] = [];
  for (let i = 1; i <= periods; i += 1) {
    const closedAt = addMonths(input.from, i);
    const interest = round2(balance * input.monthlyRate);
    if (interest <= 0) break;
    const closingBalance = round2(balance + interest);
    cycles.push({
      periodKey: toPeriodKey(closedAt),
      openingBalance: round2(balance),
      interest,
      closingBalance,
      closedAt,
    });
    balance = closingBalance;
  }
  return cycles;
}

// ─── Tabla de amortización ────────────────────────────────────────────────────

export interface ScheduleRow {
  /** 1 = primera cuota. */
  month: number;
  /** Fecha estimada de la cuota (YYYY-MM-DD) si se pasó `startDate`. */
  date: string | null;
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
  /** Interés acumulado hasta esta cuota, inclusive. */
  cumulativeInterest: number;
}

export interface ScheduleInput {
  balance: number;
  monthlyRate: number;
  /** Cuota fija a aplicar cada mes. */
  payment: number;
  /** Abono extra que se suma a la cuota todos los meses. */
  extraMonthly?: number;
  /** Fecha de la primera cuota, para fechar las filas. */
  startDate?: Date | null;
  /** Corta la tabla en N filas (0 = solo totales, sin filas). */
  limit?: number;
  /**
   * Cambio de tasa a mitad de camino: una promoción que caduca.
   *
   * Una tarjeta al 0 % «hasta el 25/01/2027» no es una deuda al 0 %: es una al
   * 0 % durante N meses y al 23,74 % a partir de ahí. Sin esto, la app promete
   * que no cuesta nada y calla la única fecha que de verdad importa.
   */
  rateAfter?: { afterMonths: number; monthlyRate: number };
}

export interface Schedule {
  rows: ScheduleRow[];
  /** true si se cortó por `limit` o por el tope de seguridad. */
  truncated: boolean;
  totalInterest: number;
  totalPaid: number;
  /** Meses reales hasta liquidar, o null si nunca. */
  months: number | null;
}

/**
 * Genera la tabla mes a mes. La última cuota se ajusta al saldo exacto para que
 * no quede un centavo colgando ni se cobre de más — igual que un banco.
 */
export function buildSchedule(input: ScheduleInput): Schedule {
  const rows: ScheduleRow[] = [];
  const monthlyRate = Math.max(0, input.monthlyRate);
  const rateAfter = input.rateAfter;
  /** La tasa vigente en la cuota número  (1 = la primera). */
  const rateFor = (month: number): number =>
    rateAfter && month > rateAfter.afterMonths ? Math.max(0, rateAfter.monthlyRate) : monthlyRate;
  const basePayment = safeAmount(input.payment) + safeAmount(input.extraMonthly);
  const limit =
    typeof input.limit === 'number' && input.limit >= 0
      ? Math.trunc(input.limit)
      : MAX_SCHEDULE_MONTHS;

  let balance = safeAmount(input.balance);
  let cumulativeInterest = 0;

  if (balance <= DUST) {
    return { rows, truncated: false, totalInterest: 0, totalPaid: 0, months: 0 };
  }
  // Sin cuota que supere el interés no hay tabla que valga: la deuda no muere.
  //
  // Con una promo que caduca esta comprobación no sirve: la tasa de hoy puede
  // ser 0 % y la de después no. Se deja que el bucle lo descubra — si al llegar
  // al tope sigue quedando saldo, devuelve `months: null` igual.
  if (!rateAfter && monthsToPayoff(balance, monthlyRate, basePayment) === null) {
    return { rows, truncated: false, totalInterest: 0, totalPaid: 0, months: null };
  }

  let month = 0;
  let totalPaid = 0;
  while (balance > DUST && month < MAX_SCHEDULE_MONTHS) {
    month += 1;
    const openingBalance = balance;
    const interest = openingBalance * rateFor(month);
    // Última cuota: solo lo que falta (capital + su interés).
    const payment = Math.min(basePayment, openingBalance + interest);
    const principal = payment - interest;
    balance = openingBalance - principal;
    if (balance < DUST) balance = 0;
    cumulativeInterest += interest;
    totalPaid += payment;

    if (month <= limit) {
      rows.push({
        month,
        date: input.startDate ? toDateKey(addMonths(input.startDate, month - 1)) : null,
        openingBalance: round2(openingBalance),
        payment: round2(payment),
        interest: round2(interest),
        principal: round2(principal),
        closingBalance: round2(balance),
        cumulativeInterest: round2(cumulativeInterest),
      });
    }
  }

  return {
    rows,
    truncated: month > limit,
    totalInterest: round2(cumulativeInterest),
    totalPaid: round2(totalPaid),
    months: balance > DUST ? null : month,
  };
}

/** Fecha local en YYYY-MM-DD (sin arrastrar zona horaria). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Proyección de una deuda ──────────────────────────────────────────────────

export interface DebtInput {
  /** Lo que se debe hoy. */
  balance: number;
  /** Tasa tal como la escribió el usuario (3 = 3 %). */
  rate: number;
  ratePeriod: RatePeriod;
  strategy: PayoffStrategy;
  /** Plazo pactado en meses (estrategia de cuota fija). */
  termMonths?: number | null;
  /** Fecha límite YYYY-MM-DD (estrategia `by_date`). */
  payoffDate?: string | null;
  /** Cuota elegida a mano (custom) o cuota pactada del crédito. */
  customPayment?: number | null;
  /** % del saldo que exige la tarjeta como mínimo. */
  minPercent?: number | null;
  /** Piso en dinero del pago mínimo. */
  minFloor?: number | null;
  /** Abono extra voluntario que el usuario suma cada mes. */
  extraMonthly?: number;
  /** Fin de una promoción al 0 %, YYYY-MM-DD. */
  promoEndsOn?: string | null;
  /** Tasa que empieza a correr cuando la promoción caduca. */
  rateAfterPromo?: number | null;
  /** Días del ciclo de facturación, para calcular el interés como el banco. */
  cycleDays?: number | null;
  /** Día del mes en que vence la cuota: define cuántas caben antes de la promo. */
  dueDay?: number | null;
  /** Punto de partida para fechar la liquidación. */
  now?: Date;
}

/**
 * El crédito tal como está guardado, en lo que le importa a la aritmética.
 *
 * `Debt` (debt-data.ts) lo cumple sin declararlo: se pide por forma y no por
 * herencia para que este módulo siga sin saber nada de SQL.
 */
export interface DebtTerms {
  currentBalance: number;
  rate: number;
  ratePeriod: RatePeriod;
  strategy: PayoffStrategy;
  termMonths: number | null;
  payoffDate: string | null;
  customPayment: number | null;
  minPercent: number | null;
  minFloor: number | null;
  extraMonthly: number;
  promoEndsOn: string | null;
  rateAfterPromo: number | null;
  cycleDays: number | null;
  dueDay: number;
}

/**
 * Traduce el crédito guardado a la entrada del motor.
 *
 * Existe porque copiar campo por campo ya salió mal dos veces, y siempre por
 * omisión: quien olvida `promoEndsOn` proyecta un 0 % eterno, y quien olvida
 * `payoffDate` deja sin cuota a la estrategia `by_date` y convierte en «deuda
 * eterna» una que se liquida en trece meses. Con una sola conversión, añadir
 * un término nuevo llega a todas las pantallas a la vez.
 */
export function toDebtInput(debt: DebtTerms, now?: Date): DebtInput {
  return {
    balance: debt.currentBalance,
    rate: debt.rate,
    ratePeriod: debt.ratePeriod,
    strategy: debt.strategy,
    termMonths: debt.termMonths,
    payoffDate: debt.payoffDate,
    customPayment: debt.customPayment,
    minPercent: debt.minPercent,
    minFloor: debt.minFloor,
    extraMonthly: debt.extraMonthly,
    promoEndsOn: debt.promoEndsOn,
    rateAfterPromo: debt.rateAfterPromo,
    cycleDays: debt.cycleDays,
    dueDay: debt.dueDay,
    now,
  };
}

export interface DebtProjection {
  monthlyRate: number;
  annualEffectiveRate: number;
  /** Lo que cuesta la deuda cada mes solo por existir. */
  monthlyInterest: number;
  /** Cuota que corresponde a la estrategia elegida (ya con el extra sumado). */
  installment: number;
  /** Cuota base sin el abono extra. */
  baseInstallment: number;
  /** Reparto de la PRÓXIMA cuota: cuánto se va en interés y cuánto baja la deuda. */
  firstSplit: { interest: number; principal: number };
  monthsToPayoff: number | null;
  payoffDate: string | null;
  totalPaid: number;
  totalInterest: number;
  /** De cada 100 pagados, cuántos se los lleva el interés (0–100). */
  interestShare: number;
  /** La cuota no cubre el interés: el saldo crece indefinidamente. */
  neverPaysOff: boolean;
  /** Cuota mínima que sí amortiza. */
  breakEven: number;
  status: ProjectionStatus;
}

/**
 * Meses que faltan hasta una fecha límite, contando el mes en curso.
 *
 * Nunca devuelve menos de 1: si la fecha ya pasó o es este mismo mes, lo que
 * queda es pagarlo todo ahora, y devolver 0 haría explotar la división.
 */
export function monthsUntilDate(payoffDate: string, now: Date = new Date()): number {
  const [y, m, d] = payoffDate.split('-').map(Number);
  if (!y || !m || !d) return 1;
  const target = new Date(y, m - 1, d);
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  // El mes cuenta entero solo si el día límite aún no llegó.
  const adjusted = target.getDate() >= now.getDate() ? months + 1 : months;
  return Math.max(1, Math.min(adjusted, MAX_SCHEDULE_MONTHS));
}

/** Cuota que impone la estrategia, antes de sumar el abono extra. */
export function installmentFor(input: DebtInput): number {
  const balance = safeAmount(input.balance);
  const monthlyRate = toMonthlyRate(input.rate, input.ratePeriod);
  if (balance <= DUST) return 0;

  switch (input.strategy) {
    case 'fixed_installment': {
      // Si el usuario ya conoce su cuota pactada, esa manda sobre la calculada.
      const agreed = safeAmount(input.customPayment);
      if (agreed > 0) return round2(agreed);
      const term = Math.trunc(safeAmount(input.termMonths));
      return frenchInstallment(balance, monthlyRate, term);
    }
    case 'by_date': {
      // La cuota NO se congela: se recalcula con los meses que quedan hasta la
      // fecha. Si un mes se abona de menos, al siguiente sube sola — que es lo
      // que de verdad hace falta para llegar a una fecha tope.
      if (!input.payoffDate) return 0;
      const months = monthsUntilDate(input.payoffDate, input.now ?? new Date());
      return frenchInstallment(balance, monthlyRate, months);
    }
    case 'minimum':
      return minimumPayment(
        balance,
        monthlyRate,
        input.minPercent ?? DEFAULT_MIN_PERCENT,
        safeAmount(input.minFloor),
      );
    case 'interest_only':
      return floorCents(monthlyInterestOf(balance, monthlyRate));
    case 'custom':
      return round2(safeAmount(input.customPayment));
  }
}

function classify(
  balance: number,
  neverPaysOff: boolean,
  months: number | null,
  interestShare: number,
): ProjectionStatus {
  if (balance <= DUST) return 'paid';
  if (neverPaysOff) return 'never';
  // Casi todo el abono se lo come el interés: el capital apenas se mueve.
  if (interestShare >= 60 || (months ?? 0) > 240) return 'stagnant';
  if (interestShare >= 35 || (months ?? 0) > 60) return 'slow';
  return 'healthy';
}

/**
 * La foto completa de una deuda con la estrategia que eligió el usuario:
 * cuánto paga, cuánto de eso es interés, cuándo termina y cuánto le habrá
 * costado en total. Es lo que alimenta la tarjeta y la hoja de detalle.
 */
export function projectDebt(input: DebtInput): DebtProjection {
  const balance = safeAmount(input.balance);
  const monthlyRate = toMonthlyRate(input.rate, input.ratePeriod);
  const annualEffectiveRate = toAnnualEffectiveRate(monthlyRate);

  // Con los días del ciclo conocidos se cobra como cobra la tarjeta: tasa
  // diaria por días del período. Es la cifra que el usuario compara contra su
  // estado de cuenta, y por un doceavo no cuadraba.
  const annualNominal = monthlyRate * 12 * 100;
  const monthlyInterest = round2(
    input.cycleDays && input.cycleDays > 0
      ? cycleInterestOf(balance, annualNominal, input.cycleDays)
      : monthlyInterestOf(balance, monthlyRate),
  );

  // Una promoción que caduca no es una tasa: son DOS, con una fecha en medio.
  const promoMonths =
    input.promoEndsOn && input.rateAfterPromo != null
      ? promoMonthsLeft(input.promoEndsOn, input.now ?? new Date(), input.dueDay)
      : null;
  const rateAfter =
    promoMonths === null
      ? undefined
      : {
          afterMonths: promoMonths,
          monthlyRate: toMonthlyRate(input.rateAfterPromo ?? 0, input.ratePeriod ?? 'annual_nominal'),
        };

  const baseInstallment = installmentFor(input);
  const extra = safeAmount(input.extraMonthly);
  const installment = round2(baseInstallment + extra);

  const now = input.now ?? new Date();
  const interestPortion = Math.min(installment, monthlyInterest);
  const firstSplit = {
    interest: round2(interestPortion),
    principal: round2(Math.max(0, Math.min(installment - interestPortion, balance))),
  };

  // El plazo lo decide el DINERO, no la etiqueta de la estrategia: "solo
  // intereses" da null por sí solo (la cuota iguala al interés), pero si el
  // usuario abona un extra voluntario esa misma deuda sí amortiza, y la
  // proyección tiene que reflejarlo.
  // Con promo, el plazo lo dice la TABLA: la fórmula cerrada supone una tasa
  // constante, y aquí hay dos.
  const scheduleForMonths = rateAfter
    ? buildSchedule({ balance, monthlyRate, payment: installment, startDate: now, limit: 0, rateAfter })
    : null;
  const months = scheduleForMonths ? scheduleForMonths.months : monthsToPayoff(balance, monthlyRate, installment);
  const neverPaysOff = balance > DUST && months === null;

  let totalPaid = 0;
  let totalInterest = 0;
  let payoffDate: string | null = null;

  if (!neverPaysOff && months !== null && months > 0) {
    const schedule = scheduleForMonths ?? buildSchedule({
      balance,
      monthlyRate,
      payment: installment,
      startDate: now,
      limit: 0,
    });
    totalPaid = schedule.totalPaid;
    totalInterest = schedule.totalInterest;
    payoffDate = toDateKey(addMonths(now, Math.max(0, (schedule.months ?? months) - 1)));
  }

  const interestShare = totalPaid > 0 ? round2((totalInterest / totalPaid) * 100) : 0;

  return {
    monthlyRate,
    annualEffectiveRate,
    monthlyInterest,
    installment,
    baseInstallment,
    firstSplit,
    monthsToPayoff: months,
    payoffDate,
    totalPaid,
    totalInterest,
    interestShare,
    neverPaysOff,
    breakEven: breakEvenPayment(balance, monthlyRate),
    status: classify(balance, neverPaysOff, months, interestShare),
  };
}

// ─── Simulación "¿y si abono un poco más?" ────────────────────────────────────

export interface ExtraSimulation {
  extraMonthly: number;
  newInstallment: number;
  newMonths: number | null;
  newPayoffDate: string | null;
  newTotalInterest: number;
  /** Meses que se adelanta la liquidación (0 si no cambia). */
  monthsSaved: number;
  /** Intereses que deja de pagar. */
  interestSaved: number;
  /** true cuando el extra es justo lo que saca la deuda del estancamiento. */
  breaksTheTrap: boolean;
}

/**
 * Compara la proyección actual contra la de abonar `extra` cada mes.
 * Es el argumento más convincente que existe para pagar por encima del mínimo,
 * y por eso se calcula en vivo mientras el usuario mueve el deslizador.
 */
export function simulateExtra(input: DebtInput, extra: number): ExtraSimulation {
  const base = projectDebt({ ...input, extraMonthly: input.extraMonthly ?? 0 });
  const boosted = projectDebt({ ...input, extraMonthly: safeAmount(input.extraMonthly) + safeAmount(extra) });

  const monthsSaved =
    base.monthsToPayoff !== null && boosted.monthsToPayoff !== null
      ? Math.max(0, base.monthsToPayoff - boosted.monthsToPayoff)
      : 0;
  const interestSaved =
    base.neverPaysOff || boosted.neverPaysOff
      ? 0
      : round2(Math.max(0, base.totalInterest - boosted.totalInterest));

  return {
    extraMonthly: round2(safeAmount(extra)),
    newInstallment: boosted.installment,
    newMonths: boosted.monthsToPayoff,
    newPayoffDate: boosted.payoffDate,
    newTotalInterest: boosted.totalInterest,
    monthsSaved,
    interestSaved,
    breaksTheTrap: base.neverPaysOff && !boosted.neverPaysOff,
  };
}

// ─── Portafolio: todas las deudas juntas ──────────────────────────────────────

export interface PortfolioDebt {
  id: string;
  name: string;
  balance: number;
  monthlyRate: number;
  installment: number;
  monthlyInterest: number;
  monthsToPayoff: number | null;
  neverPaysOff: boolean;
  status: ProjectionStatus;
}

export interface DebtPortfolio {
  totalBalance: number;
  /** Lo que el conjunto de deudas cuesta cada mes solo en intereses. */
  totalMonthlyInterest: number;
  /** Suma de todas las cuotas: el compromiso mensual real. */
  totalMonthlyCommitment: number;
  /** Método avalancha: primero la tasa más alta (ahorra más dinero). */
  avalanche: readonly PortfolioDebt[];
  /** Método bola de nieve: primero el saldo más chico (llega antes la victoria). */
  snowball: readonly PortfolioDebt[];
  /** La que más intereses genera al mes. */
  costliest: PortfolioDebt | null;
  /** Deudas que con su cuota actual no se liquidan nunca. */
  stuck: readonly PortfolioDebt[];
  /** Mes en que se liquida la última deuda, o null si alguna nunca termina. */
  freeDate: string | null;
}

/** Ordena y resume todas las deudas activas para la vista de conjunto. */
export function buildPortfolio(
  debts: readonly PortfolioDebt[],
  now: Date = new Date(),
): DebtPortfolio {
  const totalBalance = round2(debts.reduce((s, d) => s + d.balance, 0));
  const totalMonthlyInterest = round2(debts.reduce((s, d) => s + d.monthlyInterest, 0));
  const totalMonthlyCommitment = round2(debts.reduce((s, d) => s + d.installment, 0));

  // Avalancha: tasa descendente; a igual tasa, primero el saldo mayor.
  const avalanche = [...debts].sort((a, b) => b.monthlyRate - a.monthlyRate || b.balance - a.balance);
  // Bola de nieve: saldo ascendente; a igual saldo, primero la tasa más alta.
  const snowball = [...debts].sort((a, b) => a.balance - b.balance || b.monthlyRate - a.monthlyRate);

  const costliest = debts.length
    ? [...debts].sort((a, b) => b.monthlyInterest - a.monthlyInterest)[0]
    : null;
  const stuck = debts.filter((d) => d.neverPaysOff);

  const anyStuck = stuck.length > 0;
  const longest = debts.reduce((max, d) => Math.max(max, d.monthsToPayoff ?? 0), 0);
  const freeDate = anyStuck || longest === 0 ? null : toDateKey(addMonths(now, longest - 1));

  return {
    totalBalance,
    totalMonthlyInterest,
    totalMonthlyCommitment,
    avalanche,
    snowball,
    costliest,
    stuck,
    freeDate,
  };
}

// ─── Consejos ─────────────────────────────────────────────────────────────────

export type AdviceTone = 'critical' | 'warning' | 'good' | 'idea' | 'info';

export interface DebtAdvice {
  id: string;
  tone: AdviceTone;
  icon: string;
  title: string;
  body: string;
  /** Monto sugerido cuando el consejo se puede aplicar con un toque. */
  suggestedPayment?: number;
}

/**
 * Traduce los números a frases accionables. Un consejo solo aparece si hay algo
 * concreto que hacer con él — nada de relleno motivacional.
 */
export function buildDebtAdvice(
  debt: { name: string; balance: number; currency: string },
  projection: DebtProjection,
): DebtAdvice[] {
  const advice: DebtAdvice[] = [];
  const money = (n: number) => `${debt.currency} ${n.toFixed(2)}`;

  if (debt.balance <= DUST) {
    advice.push({
      id: 'paid',
      tone: 'good',
      icon: '🎉',
      title: 'Deuda liquidada',
      body: 'No queda saldo. Este crédito ya no te cuesta nada al mes.',
    });
    return advice;
  }

  if (projection.neverPaysOff) {
    // Tres formas distintas de no terminar nunca, y cada una merece su frase:
    // pagar por debajo del interés (sube), justo el interés (se congela), o
    // haber elegido a propósito abonar solo intereses.
    const short = projection.installment < projection.monthlyInterest;
    const effect = short
      ? 'no alcanza a cubrirlos, así que el saldo SUBE cada mes'
      : 'cubre justo los intereses, así que el saldo se queda congelado';
    advice.push({
      id: 'never',
      tone: 'critical',
      icon: '🛑',
      title: 'Con esta cuota la deuda nunca termina',
      body: `Cada mes se generan ${money(projection.monthlyInterest)} de interés y tu abono ${effect}. Desde ${money(projection.breakEven)} al mes empiezas a bajar capital.`,
      suggestedPayment: projection.breakEven,
    });
  } else if (projection.status === 'stagnant') {
    advice.push({
      id: 'stagnant',
      tone: 'warning',
      icon: '🐌',
      title: 'Casi todo tu pago se va en intereses',
      body: `De cada ${money(projection.installment)} que abonas, ${money(projection.firstSplit.interest)} son interés y solo ${money(projection.firstSplit.principal)} bajan la deuda.`,
    });
  }

  if (!projection.neverPaysOff && projection.monthsToPayoff !== null && projection.monthsToPayoff > 0) {
    const years = Math.floor(projection.monthsToPayoff / 12);
    const months = projection.monthsToPayoff % 12;
    const plazo = years > 0 ? `${years} año${years === 1 ? '' : 's'}${months ? ` y ${months} mes${months === 1 ? '' : 'es'}` : ''}` : `${months} mes${months === 1 ? '' : 'es'}`;
    advice.push({
      id: 'payoff',
      tone: projection.status === 'healthy' ? 'good' : 'info',
      icon: '📅',
      title: `Libre en ${plazo}`,
      body: `Manteniendo ${money(projection.installment)} al mes pagarás ${money(projection.totalInterest)} de intereses en total (${projection.interestShare.toFixed(0)} % de todo lo que entregues).`,
    });
  }

  if (projection.interestShare >= 25 && !projection.neverPaysOff) {
    const extra = round2(Math.max(10, projection.installment * 0.2));
    advice.push({
      id: 'extra',
      tone: 'idea',
      icon: '⚡',
      title: 'Abonar un poco más cambia mucho',
      body: `Sumar ${money(extra)} cada mes ataca directo el capital y recorta el interés total. Pruébalo en el simulador.`,
      suggestedPayment: round2(projection.installment + extra),
    });
  }

  return advice;
}
