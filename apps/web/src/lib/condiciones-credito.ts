/**
 * condiciones-credito.ts — las reglas del banco de cada tarjeta o préstamo.
 *
 * La app nació con las reglas de UNA tarjeta, la del dueño, comprobadas al
 * centavo contra sus estados de Bank of America: el mínimo es el 1 % del
 * saldo más los intereses y las comisiones, con piso de $35; el mínimo se
 * aplica al saldo más barato y lo que sobra al más caro (la ley de EE. UU.);
 * y un 0 % es cero de verdad. Otra persona puede tener otras:
 *
 *   - un banco que pide «el 5 % del saldo», o una cuota fija cada mes;
 *   - un reparto distinto del abono entre los saldos de la tarjeta;
 *   - una promoción de interés DIFERIDO (las tarjetas de tienda): si al final
 *     queda un centavo, cobran de golpe todo el interés desde el primer día;
 *   - un cargo por pagar tarde y una tasa de castigo.
 *
 * Aquí viven esas reglas, las plantillas para no teclearlas, su validación y
 * los cálculos que cambian con ellas. Se guardan por CUENTA —la tarjeta
 * entera, con todos sus tramos, o el préstamo— porque son del contrato, no
 * de cada saldo. Lo único que va por tramo es el tipo de promoción.
 *
 * No hay que confundirlas con la ESTRATEGIA de cada deuda (cuota fija, antes
 * de una fecha…), que es cómo decide pagar el usuario. Esto es lo que exige
 * el banco.
 *
 * Módulo PURO. Se prueba en condiciones-credito.test.ts.
 */

import { additiveMinimumPayment, round2 } from './debt-engine';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Cómo calcula el banco el pago mínimo.
 *   - `suma`: % del saldo + intereses + comisiones, con piso (EE. UU.).
 *   - `mayor`: el mayor entre un % del saldo y un piso; nunca menos que el
 *     interés del mes.
 *   - `fijo`: la misma cantidad cada mes.
 */
export type ReglaDelMinimo = 'suma' | 'mayor' | 'fijo';

/**
 * A qué saldo de la tarjeta va cada abono, cuando tiene varios.
 *   - `ley_eeuu`: el mínimo al más barato, el resto al más caro (CARD Act).
 *   - `cara_primero`: todo al de tasa más alta.
 *   - `barata_primero`: todo al de tasa más baja.
 *   - `proporcional`: a cada saldo según lo que pesa en el total.
 */
export type ReglaDelAbono = 'ley_eeuu' | 'cara_primero' | 'barata_primero' | 'proporcional';

/**
 * - `cero`: 0 % de verdad; al acabar, cobra desde el día siguiente.
 * - `diferido`: el interés corre por debajo; si al acabar queda saldo, lo
 *   cobran entero, desde el primer día.
 */
export type TipoDePromo = 'cero' | 'diferido';

export type Plantilla = 'bofa' | 'eeuu' | 'porcentaje' | 'fijo' | 'propia';

export interface ReglasDelMinimo {
  readonly regla: ReglaDelMinimo;
  /** En %, 1 = 1 %. Sin uso con `fijo`. */
  readonly porcentaje: number;
  /** El mínimo nunca baja de esto (salvo que se deba menos). Sin uso con `fijo`. */
  readonly piso: number;
  /** Solo con `fijo`. */
  readonly fijo: number | null;
}

export interface ReglasDelAtraso {
  /** Lo que cobran si el mínimo no llega a tiempo. */
  readonly cargo: number | null;
  /** La tasa anual a la que pueden subir la tarjeta tras un atraso. */
  readonly tasaPenal: number | null;
}

export interface CondicionesDeCredito {
  /** De qué plantilla salió; `propia` si se tocó a mano. Solo informa. */
  readonly plantilla: Plantilla;
  readonly minimo: ReglasDelMinimo;
  readonly abono: ReglaDelAbono;
  readonly atraso: ReglasDelAtraso;
}

/** El tipo de promoción de un tramo y, si es diferida, lo que lleva acumulado. */
export interface PromoDeTramo {
  readonly debtId: string;
  readonly tipo: TipoDePromo;
  /** El «interés diferido acumulado» que imprime el estado; null = estimarlo. */
  readonly interesDiferido: number | null;
}

// ─── Plantillas ───────────────────────────────────────────────────────────────

export interface PlantillaDeBanco {
  readonly nombre: string;
  /** Una línea: la regla en cifras. */
  readonly detalle: string;
  /** Contrastada con estados de cuenta reales, no solo con el contrato. */
  readonly comprobada: boolean;
  readonly minimo: ReglasDelMinimo;
  /** Solo las de EE. UU. fijan el reparto: ahí lo dicta la ley. */
  readonly abono: ReglaDelAbono | null;
}

export const PLANTILLAS: Readonly<Record<Exclude<Plantilla, 'propia'>, PlantillaDeBanco>> = {
  bofa: {
    nombre: 'Bank of America',
    detalle: '1 % + intereses + comisiones · piso $35',
    comprobada: true,
    minimo: { regla: 'suma', porcentaje: 1, piso: 35, fijo: null },
    abono: 'ley_eeuu',
  },
  // El piso cambia de banco a banco (entre $25 y $41 en los grandes): $35 es
  // el punto de partida, y el cuadre con el estado dice si hay que tocarlo.
  eeuu: {
    nombre: 'Otro banco de EE. UU.',
    detalle: '1 % + intereses + comisiones · piso según el banco',
    comprobada: false,
    minimo: { regla: 'suma', porcentaje: 1, piso: 35, fijo: null },
    abono: 'ley_eeuu',
  },
  porcentaje: {
    nombre: 'Un % del saldo',
    detalle: 'El mayor entre el % y un piso',
    comprobada: false,
    minimo: { regla: 'mayor', porcentaje: 5, piso: 0, fijo: null },
    abono: null,
  },
  fijo: {
    nombre: 'Cuota fija',
    detalle: 'La misma cantidad cada mes',
    comprobada: false,
    minimo: { regla: 'fijo', porcentaje: 0, piso: 0, fijo: null },
    abono: null,
  },
};

const SIN_ATRASO: ReglasDelAtraso = { cargo: null, tasaPenal: null };

/** Las condiciones de una plantilla, conservando lo que la plantilla no fija. */
export function aplicarPlantilla(actual: CondicionesDeCredito, plantilla: Exclude<Plantilla, 'propia'>): CondicionesDeCredito {
  const p = PLANTILLAS[plantilla];
  return {
    plantilla,
    // Una cuota fija ya tecleada no se borra al volver a elegir «cuota fija».
    minimo: p.minimo.regla === 'fijo' ? { ...p.minimo, fijo: actual.minimo.fijo } : p.minimo,
    abono: p.abono ?? actual.abono,
    atraso: actual.atraso,
  };
}

/** ¿Las condiciones siguen siendo las de su plantilla, o ya son «propias»? */
export function plantillaQueCoincide(
  c: Pick<CondicionesDeCredito, 'minimo' | 'abono'>,
  /**
   * La que ya tenía, si sigue valiendo. Bank of America y «otro banco de
   * EE. UU.» empiezan con las mismas cifras: sin esto, elegir la segunda
   * saltaba a la primera.
   */
  preferida?: Plantilla,
): Exclude<Plantilla, 'propia'> | null {
  if (preferida && preferida !== 'propia' && coincideConPlantilla(preferida, c)) return preferida;
  const claves = Object.keys(PLANTILLAS) as Exclude<Plantilla, 'propia'>[];
  return claves.find((clave) => coincideConPlantilla(clave, c)) ?? null;
}

function coincideConPlantilla(clave: Exclude<Plantilla, 'propia'>, c: Pick<CondicionesDeCredito, 'minimo' | 'abono'>): boolean {
  const p = PLANTILLAS[clave];
  const m = p.minimo;
  const mismoMinimo =
    m.regla === c.minimo.regla &&
    (m.regla === 'fijo' || (m.porcentaje === c.minimo.porcentaje && m.piso === c.minimo.piso));
  return mismoMinimo && (p.abono === null || p.abono === c.abono);
}

// ─── Por defecto ──────────────────────────────────────────────────────────────

/**
 * La cuenta de una deuda, que es de quien son las condiciones: su tarjeta si
 * va en una (todos los tramos comparten contrato), o ella misma.
 */
export function claveDeCuenta(d: { readonly id: string; readonly cardGroup: string | null }): string {
  return d.cardGroup ?? d.id;
}

export interface TramoParaCondiciones {
  readonly issuer: string | null;
  readonly currency: string;
  readonly minPercent: number | null;
  readonly minFloor: number | null;
  readonly minIncludesInterest: boolean;
}

/**
 * Las condiciones de una cuenta que nunca las guardó.
 *
 * Una tarjeta SUELTA ya tenía su regla del mínimo en sus campos de siempre
 * (`min_percent`, `min_floor`, `min_includes_interest`), los que usa el motor
 * para proyectarla y los que edita «Editar datos». Para ella el mínimo se lee
 * SIEMPRE de ahí, con o sin condiciones guardadas: un solo sitio, y dos
 * pantallas que nunca se contradicen. Ver `minimoDeLosCampos`.
 *
 * En una tarjeta con tramos esos campos son de cada tramo y no del contrato,
 * así que se parte de la plantilla del banco: Bank of America si lo es, EE. UU.
 * si la cuenta va en dólares, y si no, «un % del saldo».
 */
export function condicionesPorDefecto(tramos: readonly TramoParaCondiciones[]): CondicionesDeCredito {
  const esBofa = tramos.some((t) => /bank\s*of\s*america|\bbofa\b/i.test(t.issuer ?? ''));
  const base: Exclude<Plantilla, 'propia'> = esBofa ? 'bofa' : tramos[0]?.currency === 'USD' ? 'eeuu' : 'porcentaje';
  const deLaPlantilla: CondicionesDeCredito = {
    plantilla: base,
    minimo: PLANTILLAS[base].minimo,
    abono: PLANTILLAS[base].abono ?? 'ley_eeuu',
    atraso: SIN_ATRASO,
  };

  const minimo = tramos.length === 1 ? minimoDeLosCampos(tramos[0]) : null;
  return minimo ? conMinimo(deLaPlantilla, minimo) : deLaPlantilla;
}

/**
 * Las condiciones con las que se trabaja: las guardadas o las de por defecto
 * y, en una deuda suelta, con el mínimo de sus campos (ver arriba).
 */
export function condicionesDeLaCuenta(
  tramos: readonly TramoParaCondiciones[],
  guardadas: CondicionesDeCredito | null,
): CondicionesDeCredito {
  const base = guardadas ?? condicionesPorDefecto(tramos);
  const minimo = tramos.length === 1 ? minimoDeLosCampos(tramos[0]) : null;
  return minimo ? conMinimo(base, minimo) : base;
}

/** Cambia la regla del mínimo y recalcula de qué plantilla son ahora. */
export function conMinimo(c: CondicionesDeCredito, minimo: ReglasDelMinimo): CondicionesDeCredito {
  const nuevas = { ...c, minimo };
  return { ...nuevas, plantilla: plantillaQueCoincide(nuevas, c.plantilla) ?? 'propia' };
}

/**
 * La regla del mínimo que guardan los campos de una deuda suelta, o null si
 * nunca se tocaron.
 *
 * Una cuota fija se guarda como «0 % con piso»: el motor la proyecta con la
 * misma cuenta (el mayor entre 0, el piso y el interés), así que no hace falta
 * otra columna. Por eso un 0 % con piso se lee de vuelta como cuota fija.
 */
export function minimoDeLosCampos(t: Omit<TramoParaCondiciones, 'issuer' | 'currency'>): ReglasDelMinimo | null {
  if (t.minPercent == null && t.minFloor == null) return null;
  if (!t.minIncludesInterest && t.minPercent === 0 && (t.minFloor ?? 0) > 0) {
    return { regla: 'fijo', porcentaje: 0, piso: 0, fijo: t.minFloor };
  }
  return {
    regla: t.minIncludesInterest ? 'suma' : 'mayor',
    porcentaje: t.minPercent ?? (t.minIncludesInterest ? 1 : 5),
    piso: t.minFloor ?? 0,
    fijo: null,
  };
}

/** Lo contrario: los campos de la deuda suelta que guardan esta regla. */
export function camposDelMinimo(m: ReglasDelMinimo): {
  minPercent: number;
  minFloor: number;
  minIncludesInterest: boolean;
} {
  if (m.regla === 'fijo') return { minPercent: 0, minFloor: m.fijo ?? 0, minIncludesInterest: false };
  return { minPercent: m.porcentaje, minFloor: m.piso, minIncludesInterest: m.regla === 'suma' };
}

// ─── Cálculos ─────────────────────────────────────────────────────────────────

export interface ParteDelSaldo {
  /** Lo que se debe sin intereses ni comisiones. */
  readonly principal: number;
  /** Interés del ciclo pendiente. */
  readonly interest: number;
  readonly fees: number;
}

/**
 * El mínimo que pedirá el banco con estas condiciones, sobre la suma de los
 * tramos. Es una propuesta: el de verdad lo trae el estado de cuenta.
 */
export function minimoSegunCondiciones(c: CondicionesDeCredito, partes: readonly ParteDelSaldo[]): number {
  const suma = (k: keyof ParteDelSaldo) => round2(partes.reduce((s, p) => s + Math.max(0, p[k]), 0));
  const principal = suma('principal');
  const interes = suma('interest');
  const comisiones = suma('fees');
  const total = round2(principal + interes + comisiones);
  if (total <= 0) return 0;

  switch (c.minimo.regla) {
    case 'suma':
      return additiveMinimumPayment(principal, interes, c.minimo.porcentaje, c.minimo.piso, comisiones);
    case 'mayor': {
      const porPorcentaje = (total * c.minimo.porcentaje) / 100;
      // Nunca menos que lo que cobran este mes: si no, el saldo crecería por diseño.
      const minimo = Math.max(porPorcentaje, c.minimo.piso, interes + comisiones);
      return round2(Math.min(total, Math.ceil(minimo * 100) / 100));
    }
    case 'fijo':
      return round2(Math.min(total, Math.max(0, c.minimo.fijo ?? 0)));
  }
}

/**
 * El interés diferido que cobrarían de golpe si al acabar la promoción queda
 * saldo: el que imprime el estado, o una estimación.
 *
 * La estimación cobra la tasa sobre el saldo de HOY durante toda la promoción,
 * del alta al fin. El banco lo calcula día a día con el saldo de cada día, que
 * al principio era mayor: por eso se enseña con «~» y se invita a copiar la
 * cifra del estado.
 */
export function interesDiferido(input: {
  readonly saldo: number;
  /** APR de después. */
  readonly apr: number;
  /** YYYY-MM-DD */
  readonly desde: string;
  /** YYYY-MM-DD, último día de la promoción. */
  readonly hasta: string;
  readonly delEstado: number | null;
}): { monto: number; estimado: boolean } {
  if (input.delEstado != null && input.delEstado >= 0) return { monto: round2(input.delEstado), estimado: false };
  const [y1, m1, d1] = input.desde.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = input.hasta.slice(0, 10).split('-').map(Number);
  const dias = Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1);
  const monto = (Math.max(0, input.saldo) * Math.max(0, input.apr)) / 100 / 365 * dias;
  return { monto: round2(monto), estimado: true };
}

export interface CostoDelAtraso {
  readonly cargo: number | null;
  readonly tasaPenal: number | null;
  /**
   * Cuánto interés MÁS al mes costaría la tarjeta si toda pasara a la tasa de
   * castigo, frente a lo que cobra hoy. null sin tasa de castigo.
   */
  readonly interesExtraAlMes: number | null;
}

/**
 * Lo que cuesta no cubrir el mínimo a tiempo, con las cifras que el usuario
 * copió de su estado. null si no apuntó ninguna: sin ellas no hay nada que
 * decir que no sea inventado.
 *
 * El extra es el peor caso: en EE. UU. la tasa de castigo solo alcanza a los
 * saldos que ya existían tras 60 días de retraso, y a las compras nuevas
 * antes. Se enseña como «hasta».
 */
export function costoDelAtraso(
  c: CondicionesDeCredito,
  tramos: readonly { readonly balance: number; /** APR de hoy, en %. */ readonly apr: number }[],
): CostoDelAtraso | null {
  const { cargo, tasaPenal } = c.atraso;
  if (cargo == null && tasaPenal == null) return null;
  const interesExtraAlMes =
    tasaPenal == null
      ? null
      : round2(tramos.reduce((s, t) => s + (Math.max(0, t.balance) * Math.max(0, tasaPenal - t.apr)) / 100 / 12, 0));
  return { cargo, tasaPenal, interesExtraAlMes };
}

// ─── Lo que llega del formulario ──────────────────────────────────────────────

export interface CondicionesValidas {
  readonly condiciones: CondicionesDeCredito;
  readonly promos: readonly PromoDeTramo[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANTILLAS_VALIDAS: readonly Plantilla[] = ['bofa', 'eeuu', 'porcentaje', 'fijo', 'propia'];
const REGLAS_MINIMO: readonly ReglaDelMinimo[] = ['suma', 'mayor', 'fijo'];
const REGLAS_ABONO: readonly ReglaDelAbono[] = ['ley_eeuu', 'cara_primero', 'barata_primero', 'proporcional'];

function numero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** null o vacío es «no lo sé»; cualquier otra cosa tiene que ser válida. */
function opcional(v: unknown, min: number, max: number): number | null | undefined {
  if (v == null || v === '') return null;
  const n = numero(v, min, max);
  return n === null ? undefined : n;
}

/** Valida el cuerpo del formulario de condiciones. */
export function leerCondiciones(body: unknown): CondicionesValidas | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;
  const m = (b.minimo ?? {}) as Record<string, unknown>;
  const a = (b.atraso ?? {}) as Record<string, unknown>;

  const regla = REGLAS_MINIMO.find((r) => r === m.regla);
  if (!regla) return { error: 'Elige cómo calcula tu banco el mínimo' };
  const porcentaje = regla === 'fijo' ? 0 : numero(m.porcentaje, 0, 100);
  if (porcentaje === null) return { error: 'El porcentaje del mínimo tiene que estar entre 0 y 100' };
  const piso = regla === 'fijo' ? 0 : numero(m.piso ?? 0, 0, 100_000);
  if (piso === null) return { error: 'El piso del mínimo no es válido' };
  const fijo = regla === 'fijo' ? numero(m.fijo, 0.01, 10_000_000) : null;
  if (regla === 'fijo' && fijo === null) return { error: 'Escribe la cuota fija que te cobran' };
  if (regla === 'mayor' && porcentaje === 0 && piso === 0) {
    return { error: 'Con 0 % y sin piso el mínimo sería solo el interés: revisa tu estado' };
  }

  const abono = REGLAS_ABONO.find((r) => r === b.abono);
  if (!abono) return { error: 'Elige a dónde va tu abono' };

  const cargo = opcional(a.cargo, 0, 10_000);
  if (cargo === undefined) return { error: 'El cargo por atraso no es válido' };
  const tasaPenal = opcional(a.tasaPenal, 0, 100);
  if (tasaPenal === undefined) return { error: 'La tasa por atraso tiene que estar entre 0 y 100 %' };

  const promos: PromoDeTramo[] = [];
  for (const p of (Array.isArray(b.promos) ? b.promos : []).slice(0, 12)) {
    const o = (p ?? {}) as Record<string, unknown>;
    if (typeof o.debtId !== 'string' || !UUID.test(o.debtId)) return { error: 'Saldo desconocido' };
    const tipo: TipoDePromo = o.tipo === 'diferido' ? 'diferido' : 'cero';
    const acumulado = tipo === 'diferido' ? opcional(o.interesDiferido, 0, 10_000_000) : null;
    if (acumulado === undefined) return { error: 'El interés diferido no es válido' };
    promos.push({ debtId: o.debtId, tipo, interesDiferido: acumulado });
  }

  const minimo: ReglasDelMinimo = { regla, porcentaje, piso, fijo };
  const pedida = PLANTILLAS_VALIDAS.find((p) => p === b.plantilla) ?? 'propia';
  // La plantilla solo informa: si las cifras ya no son las suyas, son propias.
  const plantilla: Plantilla = plantillaQueCoincide({ minimo, abono }, pedida) ?? 'propia';

  return { condiciones: { plantilla, minimo, abono, atraso: { cargo, tasaPenal } }, promos };
}
