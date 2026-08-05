/**
 * expense-scope.ts — separar lo personal de lo del negocio.
 *
 * Quien tiene un negocio no vive con dos carteras estancas: la factura del
 * teléfono es 60 % trabajo y 40 % casa, el carro es mitad y mitad. Por eso el
 * modelo NO es un interruptor personal/negocio, sino **un solo número**:
 * `businessShare`, el porcentaje del gasto que corresponde al negocio.
 *
 *   0   → totalmente personal
 *   100 → totalmente del negocio
 *   50  → mitad y mitad
 *
 * Guardar un único número (y derivar de él la etiqueta) hace imposible el
 * estado contradictorio que sí permitiría un enum aparte: «marcado como
 * personal, pero con 60 % de negocio». Si no se puede representar, no hay que
 * validarlo ni repararlo después.
 *
 * Funciones puras; se prueban en expense-scope.test.ts.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Etiqueta legible del ámbito. SIEMPRE derivada de `businessShare`. */
export type ExpenseScope = 'personal' | 'business' | 'mixed';

/** Filtro de la interfaz: qué se está mirando. */
export type ScopeFilter = 'all' | 'personal' | 'business';

export interface ScopedAmount {
  /** Lo que sale de tu bolsillo. */
  personal: number;
  /** Lo que corresponde al negocio. */
  business: number;
}

/** Cualquier cosa que cueste dinero y se pueda repartir. */
export interface ScopedItem {
  id: string;
  name: string;
  amount: number;
  businessShare: number;
}

export interface ScopeSummary {
  personal: number;
  business: number;
  total: number;
  /** Cuántos son 100 % personales. */
  personalCount: number;
  /** Cuántos son 100 % del negocio. */
  businessCount: number;
  /** Cuántos están repartidos entre los dos. */
  mixedCount: number;
  /** % del total que se lleva el negocio (0–100). */
  businessPercent: number;
}

export const EMPTY_SCOPE_SUMMARY: ScopeSummary = {
  personal: 0,
  business: 0,
  total: 0,
  personalCount: 0,
  businessCount: 0,
  mixedCount: 0,
  businessPercent: 0,
};

// ─── Utilidades ───────────────────────────────────────────────────────────────

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normaliza el porcentaje a un número válido entre 0 y 100.
 *
 * Todo lo que no se entienda cae en 0, es decir, personal: ante la duda el
 * gasto es tuyo. Es la suposición conservadora — inflar por error el lado del
 * negocio distorsionaría el resultado del negocio y, si esto acaba usándose
 * para declarar impuestos, hacia el lado equivocado.
 */
export function normalizeShare(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, round2(n));
}

/** Etiqueta del ámbito a partir del porcentaje. */
export function scopeOf(businessShare: number): ExpenseScope {
  const share = normalizeShare(businessShare);
  if (share <= 0) return 'personal';
  if (share >= 100) return 'business';
  return 'mixed';
}

/** ¿Este ítem entra en lo que el usuario está mirando ahora? */
export function matchesFilter(businessShare: number, filter: ScopeFilter): boolean {
  if (filter === 'all') return true;
  const share = normalizeShare(businessShare);
  // Un gasto mixto aparece en AMBAS vistas, con su parte correspondiente: es
  // real en las dos, y esconderlo en una dejaría un agujero en ese total.
  return filter === 'business' ? share > 0 : share < 100;
}

// ─── Reparto ──────────────────────────────────────────────────────────────────

/**
 * Reparte un importe entre lo personal y lo del negocio.
 *
 * La parte del negocio se calcula y la personal se obtiene POR RESTA, nunca
 * calculando las dos por separado. Con dos redondeos independientes, $0.05 al
 * 50 % daría 0.03 + 0.03 = 0.06 y el reparto inventaría un centavo. Restando,
 * la suma cuadra siempre con el importe original — que es la única propiedad
 * que no se puede romper si estos números van a sumarse en un total.
 */
export function splitAmount(amount: number, businessShare: number): ScopedAmount {
  const total = Number.isFinite(amount) ? amount : 0;
  const share = normalizeShare(businessShare);
  if (share <= 0) return { personal: round2(total), business: 0 };
  if (share >= 100) return { personal: 0, business: round2(total) };

  const business = round2((total * share) / 100);
  return { personal: round2(total - business), business };
}

/** La parte que sale de tu bolsillo. */
export function personalPart(amount: number, businessShare: number): number {
  return splitAmount(amount, businessShare).personal;
}

/** La parte que corresponde al negocio. */
export function businessPart(amount: number, businessShare: number): number {
  return splitAmount(amount, businessShare).business;
}

// ─── Agregados ────────────────────────────────────────────────────────────────

/**
 * Suma una lista repartiendo cada ítem por su propio porcentaje.
 *
 * Se acumula en crudo y se redondea SOLO al salir: redondear ítem a ítem
 * arrastraría el error a lo largo de la lista.
 */
export function summarizeByScope(items: readonly ScopedItem[]): ScopeSummary {
  let personal = 0;
  let business = 0;
  let personalCount = 0;
  let businessCount = 0;
  let mixedCount = 0;

  for (const item of items) {
    const split = splitAmount(item.amount, item.businessShare);
    personal += split.personal;
    business += split.business;
    switch (scopeOf(item.businessShare)) {
      case 'personal':
        personalCount += 1;
        break;
      case 'business':
        businessCount += 1;
        break;
      default:
        mixedCount += 1;
    }
  }

  const total = personal + business;
  return {
    personal: round2(personal),
    business: round2(business),
    total: round2(total),
    personalCount,
    businessCount,
    mixedCount,
    businessPercent: total > 0 ? round2((business / total) * 100) : 0,
  };
}

/** Total de la lista según lo que el usuario esté mirando. */
export function totalForFilter(items: readonly ScopedItem[], filter: ScopeFilter): number {
  const summary = summarizeByScope(items);
  if (filter === 'personal') return summary.personal;
  if (filter === 'business') return summary.business;
  return summary.total;
}

// ─── Resultado del negocio ────────────────────────────────────────────────────

export interface BusinessResult {
  income: number;
  expenses: number;
  /** Ingresos − gastos. Negativo = el negocio pierde dinero. */
  result: number;
  /** Margen sobre los ingresos (0–100). 0 si no hay ingresos. */
  margin: number;
  /** true si el negocio no tiene ingresos declarados pero sí gastos. */
  expensesWithoutIncome: boolean;
}

/**
 * El resultado del negocio: lo que entra menos lo que sale, solo con la parte
 * de negocio de cada cosa.
 *
 * Separar los gastos sin separar también los ingresos dejaría un negocio que
 * únicamente pierde dinero — por eso los ingresos llevan el mismo reparto y
 * esta función exige ambos lados.
 */
export function buildBusinessResult(income: number, expenses: number): BusinessResult {
  const inc = Number.isFinite(income) ? Math.max(0, income) : 0;
  const exp = Number.isFinite(expenses) ? Math.max(0, expenses) : 0;
  const result = round2(inc - exp);
  return {
    income: round2(inc),
    expenses: round2(exp),
    result,
    margin: inc > 0 ? round2((result / inc) * 100) : 0,
    expensesWithoutIncome: inc <= 0 && exp > 0,
  };
}
