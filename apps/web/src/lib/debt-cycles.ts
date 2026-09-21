import { additiveMinimumPayment } from './debt-engine';
import type { DebtMovement } from './debt-data';

/**
 * Cortar el historial de una tarjeta por donde lo corta el banco.
 *
 * El libro mayor se enseñaba como una lista plana: todos los movimientos
 * seguidos, sin decir a qué periodo pertenecen. Para una tarjeta eso no es
 * historial, es un montón — la pregunta real es «¿cuánto gasté ESTE ciclo?»,
 * y el ciclo de una tarjeta no empieza el día 1: empieza al día siguiente del
 * corte anterior.
 *
 * Con `statementDay` puesto se agrupa por ciclo de facturación; sin él, por mes
 * natural, que es lo más honesto que se puede hacer sin el dato. Las cifras de
 * cada periodo salen de sus propios movimientos, así que cambian de valor
 * según el corte — que es justo lo pedido.
 */

export interface BillingPeriod {
  /** Clave estable: YYYY-MM-DD del día de cierre. */
  key: string;
  /** Primer día del periodo, 00:00 local. */
  start: Date;
  /** Día de cierre, 23:59:59.999 local — el último que cuenta en el periodo. */
  end: Date;
  /** «15 sep – 14 oct 2026» con corte; «septiembre 2026» sin él. */
  label: string;
  /** Etiqueta corta para el selector. */
  shortLabel: string;
  /** El periodo que corre ahora mismo: aún no ha cerrado. */
  isCurrent: boolean;
  /** Si lo manda el día de corte de la tarjeta o el mes natural. */
  byStatement: boolean;
}

export interface CycleSummary {
  period: BillingPeriod;
  /** Los del periodo, del más reciente al más antiguo. */
  movements: DebtMovement[];
  /**
   * Lo que se debía al abrir el periodo — el «Saldo Anterior» del estado.
   * `null` cuando no hay de dónde deducirlo.
   */
  openingBalance: number | null;
  /** Consumos del periodo. */
  charges: number;
  /** Intereses devengados dentro del periodo. */
  interest: number;
  /** Comisiones, moras, anualidades. */
  fees: number;
  /** Lo abonado, en positivo. */
  payments: number;
  /** De lo abonado, cuánto bajó de verdad la deuda. */
  principalPaid: number;
  /** Ajustes manuales, netos (pueden restar). */
  adjustments: number;
  /** Cuánto subió (+) o bajó (−) la deuda en el periodo. */
  net: number;
  /**
   * Saldo al cerrar el periodo. En el periodo en curso es el saldo de hoy.
   * `null` cuando el periodo no tiene movimientos y no hay de dónde sacarlo.
   */
  closingBalance: number | null;
  /** Días que cuenta el periodo; en el que corre, los transcurridos. */
  days: number;
  /**
   * Saldo promedio diario del periodo — sobre ESTO cobra el banco.
   *
   * No sobre el saldo de hoy ni sobre el del corte: sobre el promedio de lo
   * que se debió cada día. En el estado del 11 ago – 10 sep de la Cash
   * Rewards son $2,080.04 frente a un saldo final de $2,139.57, y la
   * diferencia sale de haber abonado $1,375 a mitad de ciclo.
   */
  averageDailyBalance: number | null;
  /**
   * Interés que sale de ese promedio a la tasa de la tarjeta, con la fórmula
   * del banco: promedio × (APR / 365) × días. `null` sin tasa o sin promedio.
   */
  estimatedInterest: number | null;
  /**
   * El pago mínimo que exigió el estado de ese ciclo.
   *
   * Solo en ciclos cerrados y solo con la regla del emisor: en el que corre
   * todavía no hay estado, y sin regla no hay fórmula que aplicar. Para la
   * Cash Rewards del 11 ago – 10 sep sale $53.00, el del papel.
   */
  statementMinimum: number | null;
}

/** Cómo calcula el emisor el mínimo del estado de cuenta. */
export interface MinimumRule {
  /** % del saldo que se exige (1 en Bank of America). */
  percent: number;
  /** Piso en dinero ($35 en Bank of America). */
  floor: number;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * El día 31 no existe en todos los meses.
 *
 * Una tarjeta que corta el 31 cierra el 28 en febrero — es lo que hace el
 * banco, y si no se recorta aquí el periodo se desborda al mes siguiente y
 * dos ciclos se solapan.
 */
function clampDay(day: number, year: number, month: number): number {
  return Math.min(Math.max(1, day), lastDayOfMonth(year, month));
}

function startOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
}

function endOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 23, 59, 59, 999);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildLabels(start: Date, end: Date, byStatement: boolean): { label: string; shortLabel: string } {
  if (!byStatement) {
    return {
      label: `${MESES[end.getMonth()]} ${end.getFullYear()}`,
      shortLabel: `${MESES_CORTOS[end.getMonth()]} ${end.getFullYear()}`,
    };
  }
  const mismoAno = start.getFullYear() === end.getFullYear();
  const izq = `${start.getDate()} ${MESES_CORTOS[start.getMonth()]}${mismoAno ? '' : ` ${start.getFullYear()}`}`;
  const der = `${end.getDate()} ${MESES_CORTOS[end.getMonth()]} ${end.getFullYear()}`;
  return { label: `${izq} – ${der}`, shortLabel: `${izq} – ${der}` };
}

/**
 * El periodo que contiene esa fecha.
 *
 * Con corte el día D, el ciclo va del D+1 del mes anterior al D de este mes,
 * ambos incluidos: el movimiento del propio día de corte entra en el estado
 * que cierra ese día, como en el papel del banco.
 */
export function periodContaining(
  date: Date,
  statementDay: number | null,
  now: Date = new Date(),
): BillingPeriod {
  const y = date.getFullYear();
  const m = date.getMonth();

  if (statementDay == null) {
    const start = startOfDay(y, m, 1);
    const end = endOfDay(y, m, lastDayOfMonth(y, m));
    return {
      key: dateKey(end),
      start,
      end,
      ...buildLabels(start, end, false),
      isCurrent: now >= start && now <= end,
      byStatement: false,
    };
  }

  const cierreEsteMes = clampDay(statementDay, y, m);
  // Pasado el corte, la fecha pertenece al ciclo que cerrará el mes que viene.
  const cierraDespues = date.getDate() > cierreEsteMes;
  const finY = cierraDespues ? (m === 11 ? y + 1 : y) : y;
  const finM = cierraDespues ? (m === 11 ? 0 : m + 1) : m;
  const end = endOfDay(finY, finM, clampDay(statementDay, finY, finM));

  // El arranque es el día siguiente al corte anterior, no el día del corte.
  const iniY = finM === 0 ? finY - 1 : finY;
  const iniM = finM === 0 ? 11 : finM - 1;
  const start = startOfDay(iniY, iniM, clampDay(statementDay, iniY, iniM) + 1);

  return {
    key: dateKey(end),
    start,
    end,
    ...buildLabels(start, end, true),
    isCurrent: now >= start && now <= end,
    byStatement: true,
  };
}

/** El periodo anterior a este: el que acaba el día antes de que empiece. */
export function previousPeriod(period: BillingPeriod, statementDay: number | null, now?: Date): BillingPeriod {
  const anterior = new Date(period.start.getTime() - 1);
  return periodContaining(anterior, statementDay, now);
}

/** El periodo siguiente: el que empieza el día después del cierre. */
export function nextPeriod(period: BillingPeriod, statementDay: number | null, now?: Date): BillingPeriod {
  const siguiente = new Date(period.end.getTime() + 1);
  return periodContaining(siguiente, statementDay, now);
}

const MS_PER_DAY = 86_400_000;

/** Cuánto mueve el saldo un movimiento: los abonos lo bajan, el resto lo sube. */
function delta(m: DebtMovement): number {
  return m.kind === 'payment' ? -Math.abs(m.amount) : m.amount;
}

/**
 * Saldo promedio diario del periodo, que es la base real del interés.
 *
 * Se recorre día a día desde el saldo de apertura aplicando lo que pasó ese
 * día, igual que el banco. Un ciclo abierto solo promedia los días que van
 * corridos: promediar sobre 31 cuando llevas 10 dividiría por tres la cifra y
 * diría que debes mucho menos de lo que debes.
 *
 * Es un cálculo con la información que tiene la app: el banco usa la fecha en
 * que cada movimiento SE REGISTRA, que en su papel llega un día o dos después
 * de la compra, así que puede quedar a unos centavos. Sirve para cuadrar con
 * el estado de cuenta, no para sustituirlo.
 */
function averageDailyBalance(
  dentro: readonly DebtMovement[],
  opening: number,
  period: BillingPeriod,
  now: Date,
): { average: number; days: number } {
  const ultimo = period.isCurrent && now < period.end ? now : period.end;
  const dias = Math.max(
    1,
    Math.round((startOfDay(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate()).getTime()
      - period.start.getTime()) / MS_PER_DAY) + 1,
  );

  // Del más antiguo al más nuevo: el recorrido va hacia adelante en el tiempo.
  const cronologico = [...dentro].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  let saldo = opening;
  let suma = 0;
  let i = 0;
  for (let d = 0; d < dias; d++) {
    const finDelDia = period.start.getTime() + (d + 1) * MS_PER_DAY - 1;
    while (i < cronologico.length && new Date(cronologico[i].occurredAt).getTime() <= finDelDia) {
      saldo = Math.max(0, saldo + delta(cronologico[i]));
      i++;
    }
    suma += saldo;
  }

  return { average: round2(suma / dias), days: dias };
}

/** Las cifras de un periodo, sacadas solo de los movimientos que caen dentro. */
export function summarizePeriod(
  movements: readonly DebtMovement[],
  period: BillingPeriod,
  currentBalance: number,
  /** Tasa anual de la tarjeta (18.49 = 18,49 %). Sin ella no se estima interés. */
  annualRate = 0,
  now: Date = new Date(),
  /** Regla del mínimo aditivo, si la tarjeta la usa. */
  minRule: MinimumRule | null = null,
): CycleSummary {
  const desde = period.start.getTime();
  const hasta = period.end.getTime();

  const dentro = movements
    .filter((m) => {
      const t = new Date(m.occurredAt).getTime();
      return Number.isFinite(t) && t >= desde && t <= hasta;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  let charges = 0;
  let interest = 0;
  let fees = 0;
  let payments = 0;
  let principalPaid = 0;
  let adjustments = 0;

  for (const m of dentro) {
    switch (m.kind) {
      case 'charge': charges += m.amount; break;
      case 'interest': interest += m.amount; break;
      case 'fee': fees += m.amount; break;
      case 'payment':
        payments += Math.abs(m.amount);
        principalPaid += m.principalPart;
        break;
      default: adjustments += m.amount; break;
    }
  }

  /**
   * El saldo al cierre.
   *
   * En el ciclo en curso no hay cierre todavía: lo que vale es lo que se debe
   * hoy, y esa cifra es la del encabezado de la hoja —no una reconstruida a
   * partir de la lista, que podría venir recortada por el límite de la
   * consulta y no cuadrar—. En un ciclo ya cerrado se lee del último
   * movimiento, cuya foto del saldo se reescribe entera cada vez que se edita
   * o se borra una fila (ver `resnapshotLedger`).
   */
  const closingBalance = period.isCurrent
    ? round2(currentBalance)
    : dentro.length > 0
      ? round2(dentro[0].balanceAfter)
      : null;

  /**
   * El «Saldo Anterior» del estado de cuenta.
   *
   * Lo mejor es la foto que el propio libro guarda: `balanceBefore` del
   * movimiento más antiguo del periodo, que se reescribe en orden cada vez que
   * se edita o se borra una fila. Si el periodo está vacío, se hereda el
   * cierre del último movimiento anterior; y si tampoco hay nada antes, es que
   * la deuda no existía —salvo en el ciclo en curso de una deuda sin ningún
   * movimiento cargado, donde lo que se debe hoy es también lo de apertura.
   */
  const anteriores = movements
    .filter((m) => new Date(m.occurredAt).getTime() < desde)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const openingBalance =
    dentro.length > 0
      ? round2(dentro[dentro.length - 1].balanceBefore)
      : anteriores.length > 0
        ? round2(anteriores[0].balanceAfter)
        : period.isCurrent && movements.length === 0
          ? round2(currentBalance)
          : null;

  const { average, days } =
    openingBalance === null
      ? { average: null, days: 0 }
      : averageDailyBalance(dentro, openingBalance, period, now);

  // La misma fórmula del banco: promedio × tasa diaria × días del ciclo.
  const estimatedInterest =
    average !== null && annualRate > 0 && days > 0
      ? round2(average * (annualRate / 100 / 365) * days)
      : null;

  const promedio = average;

  /**
   * El mínimo que pidió el estado de ese ciclo.
   *
   * El porcentaje va sobre el saldo SIN lo que se acaba de cobrar —el banco
   * cobra 1 % del capital y suma aparte el interés y las comisiones—, así que
   * la base es el saldo al corte menos ambos. Comprobado contra el papel:
   * 1 % de $2,106.91 + $32.66 = $53.73, truncado al dólar, $53.00.
   */
  const statementMinimum =
    minRule !== null && !period.isCurrent && closingBalance !== null
      ? additiveMinimumPayment(
          Math.max(0, round2(closingBalance - interest - fees)),
          interest,
          minRule.percent,
          minRule.floor,
          fees,
        )
      : null;

  return {
    period,
    movements: dentro,
    charges: round2(charges),
    interest: round2(interest),
    fees: round2(fees),
    payments: round2(payments),
    principalPaid: round2(principalPaid),
    adjustments: round2(adjustments),
    net: round2(charges + interest + fees + adjustments - payments),
    openingBalance,
    closingBalance,
    days,
    averageDailyBalance: promedio,
    estimatedInterest,
    statementMinimum,
  };
}

/**
 * Todos los periodos con los que se puede navegar, del más nuevo al más viejo.
 *
 * Se incluye el actual aunque esté vacío —es el que se abre— y los periodos
 * intermedios sin movimientos, para que ir hacia atrás no dé saltos raros de
 * fecha. El más antiguo lo marca el primer movimiento registrado.
 */
export function listPeriods(
  movements: readonly DebtMovement[],
  statementDay: number | null,
  now: Date = new Date(),
  maxPeriods = 60,
): BillingPeriod[] {
  const actual = periodContaining(now, statementDay, now);
  const tiempos = movements
    .map((m) => new Date(m.occurredAt).getTime())
    .filter((t) => Number.isFinite(t));
  const masAntiguo = tiempos.length > 0 ? Math.min(...tiempos) : now.getTime();

  const periodos: BillingPeriod[] = [actual];
  let cursor = actual;
  while (cursor.start.getTime() > masAntiguo && periodos.length < maxPeriods) {
    cursor = previousPeriod(cursor, statementDay, now);
    periodos.push(cursor);
  }
  return periodos;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── Devengo por ciclo de corte ───────────────────────────────────────────────

export interface StatementAccrual {
  /** Mes del cierre, YYYY-MM: la clave de idempotencia del libro mayor. */
  periodKey: string;
  period: BillingPeriod;
  /** Lo que se debía al abrir el ciclo. */
  openingBalance: number;
  /** La base real del interés. */
  averageDailyBalance: number;
  days: number;
  interest: number;
  /** Saldo al cerrar, ya con el interés dentro. */
  closingBalance: number;
}

/**
 * Las fechas de corte que YA cerraron entre `from` (excluido) y `to`.
 *
 * Un corte cierra al acabar su día: el estado del 10 de septiembre incluye lo
 * del propio día 10, así que hasta el 11 no hay nada que cobrar. Por eso el
 * corte se sitúa a las 23:59:59.999 y solo cuenta si `to` ya lo pasó.
 *
 * Es barato a propósito —solo fechas, sin tocar el libro— porque el devengo lo
 * llama en CADA lectura para saber si hay algo que hacer, y casi siempre no lo
 * hay.
 */
export function statementCuts(
  from: Date,
  to: Date,
  statementDay: number,
  maxCuts = 36,
): Date[] {
  if (!(from instanceof Date) || !(to instanceof Date)) return [];
  const cuts: Date[] = [];

  let y = from.getFullYear();
  let m = from.getMonth();
  for (let i = 0; i <= maxCuts + 1 && cuts.length < maxCuts; i++) {
    const cut = endOfDay(y, m, clampDay(statementDay, y, m));
    if (cut.getTime() > from.getTime()) {
      if (cut.getTime() > to.getTime()) break;
      cuts.push(cut);
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return cuts;
}

/**
 * El interés que cobra el banco en cada ciclo cerrado desde `from`.
 *
 * Tres cosas lo separan del devengo mensual de siempre, y las tres salen del
 * estado de cuenta real:
 *
 * 1. Cierra el DÍA DE CORTE, no en el aniversario del alta ni a fin de mes.
 * 2. Cobra por DÍAS REALES del ciclo —tasa diaria × 31, o × 28 en febrero—,
 *    no un doceavo de la anual.
 * 3. Lo cobra sobre el SALDO PROMEDIO DIARIO, no sobre el saldo al cierre. En
 *    un ciclo con un abono fuerte a mitad la diferencia es de dólares, y
 *    siempre en contra del usuario si se usa el saldo final.
 *
 * Los ciclos se encadenan: el interés de uno entra en el saldo de apertura del
 * siguiente, que es lo que hace que la deuda componga.
 */
export function statementAccruals(
  movements: readonly DebtMovement[],
  input: {
    statementDay: number;
    /** Tasa anual nominal (18.49 = 18,49 %). */
    annualRate: number;
    /** Último devengo: se cobran los cortes posteriores a esta fecha. */
    from: Date;
    to: Date;
    /** Saldo de hoy, por si el ciclo no tiene de dónde deducir su apertura. */
    currentBalance: number;
  },
): StatementAccrual[] {
  const { statementDay, annualRate, from, to, currentBalance } = input;
  if (!(annualRate > 0)) return [];

  const cuts = statementCuts(from, to, statementDay);
  if (cuts.length === 0) return [];

  const diaria = annualRate / 100 / 365;
  const out: StatementAccrual[] = [];
  /** El cierre del ciclo anterior, para encadenar. `null` en el primero. */
  let heredado: number | null = null;

  for (const cut of cuts) {
    const period = periodContaining(cut, statementDay, to);
    const resumen = summarizePeriod(movements, period, currentBalance, 0, to);
    const opening = heredado ?? resumen.openingBalance;
    if (opening === null) continue;

    const { average, days } = averageDailyBalance(resumen.movements, opening, period, to);
    const interest = round2(average * diaria * days);
    // El movimiento del propio interés no está todavía en el libro, así que el
    // cierre se arma con lo que pasó en el ciclo más lo que se acaba de cobrar.
    const cierre = round2(
      Math.max(0, opening + resumen.charges + resumen.fees + resumen.adjustments - resumen.payments)
        + interest,
    );

    if (interest > 0) {
      out.push({
        periodKey: `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}`,
        period,
        openingBalance: round2(opening),
        averageDailyBalance: average,
        days,
        interest,
        closingBalance: cierre,
      });
    }
    heredado = cierre;
  }

  return out;
}
