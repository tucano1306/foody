/**
 * card-payment.ts — un abono a una tarjeta que tiene varios tramos.
 *
 * Una tarjeta no es un saldo: son varios, cada uno con su tasa. La Unlimited
 * Cash 3650 lleva tres a la vez —compras al 23.74 %, un adelanto al 0 % que
 * caduca el 25 oct 2026 y otro al 0 % hasta el 25 ene 2027—, pero el banco
 * pide UN mínimo y el usuario hace UN pago. La pregunta de siempre era «¿a
 * cuál de los tres le cae lo que pagué?», y la app no sabía contestarla: cada
 * tramo era una deuda suelta y el abono había que partirlo a ojo.
 *
 * Cómo lo reparte el banco, comprobado contra los estados de agosto y
 * septiembre de 2026 de esa tarjeta (los cuatro saldos promedio y los dos
 * intereses cuadran al centavo; ver card-payment.test.ts):
 *
 *   1. Lo que cubre el MÍNIMO va al tramo de tasa más BAJA. Entre dos al 0 %,
 *      al que caduca antes. El pago de $160 del 30 ago: $158 (el mínimo) al
 *      adelanto que caduca en octubre.
 *   2. Lo que pasa del mínimo va al tramo de tasa más ALTA. Eso no es una
 *      costumbre del banco sino la ley (CARD Act, Reg. Z §1026.53): de esos
 *      $160, los $2 de más fueron a compras al 23.74 %.
 *
 * Consecuencia que esto hace visible: pagando solo el mínimo, el tramo que
 * cobra interés no baja nunca.
 *
 * La misma ley tiene una excepción para las promociones de interés DIFERIDO
 * (§1026.53(b)): en los dos ciclos antes de que caduquen, el excedente va
 * primero a ese tramo, porque un centavo que quede ahí al final hace que cobren
 * todo el interés desde el primer día. Los 0 % de Bank of America son de cero
 * de verdad y no la activan; una tarjeta de tienda, sí.
 *
 * Esa es la regla de EE. UU. Otro banco puede repartir de otra forma —todo al
 * saldo caro, todo al barato, o en proporción—, y cada tarjeta guarda la suya
 * en sus condiciones (condiciones-credito.ts).
 *
 * Módulo PURO. Se prueba en card-payment.test.ts.
 */

import {
  additiveMinimumPayment,
  promoVigente,
  round2,
  tasaMensualDelDia,
  type RatePeriod,
} from './debt-engine';
import type { ReglaDelAbono, TipoDePromo } from './condiciones-credito';

export interface CardTramo {
  readonly id: string;
  readonly name: string;
  /** Lo que debe este tramo ahora, interés pendiente incluido. */
  readonly balance: number;
  readonly rate: number;
  readonly ratePeriod: RatePeriod;
  /** Último día de su promoción, YYYY-MM-DD. */
  readonly promoEndsOn: string | null;
  /**
   * La tasa que corre desde el día siguiente: SIEMPRE anual (APR), como la pide
   * el formulario («Después, tasa anual»), sea cual sea `ratePeriod`.
   */
  readonly rateAfterPromo: number | null;
  /** Cero de verdad, o interés diferido. Sin dato, cero: es lo habitual en un banco. */
  readonly promoKind?: TipoDePromo | null;
}

/**
 * Los «dos ciclos antes de caducar» de la ley, en días. Se cuenta desde hoy y
 * no desde el cierre del estado porque el reparto se hace el día del abono, y
 * 62 días cubren dos ciclos de 31.
 */
export const VENTANA_DIFERIDO_DIAS = 62;

function diasHasta(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = hasta.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** ¿El tramo es un diferido que la ley manda pagar primero hoy? */
export function diferidoPorCaducar(tramo: CardTramo, hoy: string): boolean {
  if (tramo.promoKind !== 'diferido' || !tramo.promoEndsOn || !enPromocion(tramo, hoy)) return false;
  return diasHasta(hoy, tramo.promoEndsOn) <= VENTANA_DIFERIDO_DIAS;
}

/** ¿Sigue en promoción el día `hoy` (YYYY-MM-DD)? El último día aún cuenta. */
export function enPromocion(tramo: Pick<CardTramo, 'promoEndsOn'>, hoy: string): boolean {
  return promoVigente(tramo.promoEndsOn, hoy);
}

/**
 * La tasa mensual que corre HOY en el tramo, en tanto por uno.
 *
 * Una promoción caducada deja de valer su 0 %: desde el día siguiente corre la
 * tasa de después, y es con esa con la que el banco lo ordena.
 *
 * La de después se lee como APR aunque el tramo diga «mensual»: en un tramo al
 * 0 % el período no se usa, y la Unlimited Cash 3650 está guardada así. Leída
 * en su período, su 23.74 % anual se volvía un 23.74 % mensual.
 *
 * Es la MISMA función que usa el devengo: el día en que el banco empieza a
 * cobrar un tramo es el mismo en que el reparto lo trata como caro.
 */
export function tasaVigente(tramo: CardTramo, hoy: string): number {
  return tasaMensualDelDia(tramo, hoy);
}

export interface CardAllocationPart {
  readonly tramoId: string;
  readonly name: string;
  /** Todo lo que recibe este tramo. */
  readonly amount: number;
  /** De ello, lo que viene del mínimo. */
  readonly fromMinimum: number;
  /** De ello, lo que viene de pagar por encima del mínimo. */
  readonly fromExcess: number;
  readonly balanceBefore: number;
  readonly balanceAfter: number;
  /** Tasa mensual vigente, para enseñarla. */
  readonly monthlyRate: number;
}

export interface CardAllocation {
  /** Solo los tramos que reciben algo, en el orden en que el banco los paga. */
  readonly parts: readonly CardAllocationPart[];
  /** Cuánto del abono cuenta como mínimo. */
  readonly minimumPart: number;
  /** Cuánto pasa del mínimo. */
  readonly excessPart: number;
  /** Lo que se aplica de verdad. */
  readonly applied: number;
  /** Lo que sobra tras dejar la tarjeta en cero. */
  readonly overpayment: number;
}

/** Fin de promoción como clave de orden: sin promoción, al final. */
function claveCaducidad(t: CardTramo): string {
  return t.promoEndsOn?.slice(0, 10) ?? '9999-12-31';
}

/**
 * Reparte un abono entre los tramos de una tarjeta, como lo hace el banco.
 *
 * `minimumDue` es el mínimo del estado de cuenta. Lo que no llega al mínimo
 * cuenta entero como mínimo; lo que lo pasa, como excedente. Con una regla que
 * no es la de EE. UU. la distinción no cambia a dónde va el dinero, pero se
 * conserva: es la que cuenta en el libro mayor de qué salió cada abono.
 */
export function allocateCardPayment(input: {
  readonly tramos: readonly CardTramo[];
  readonly amount: number;
  readonly minimumDue: number;
  /** Hoy, YYYY-MM-DD: decide qué promociones siguen vivas. */
  readonly hoy: string;
  /** Cómo reparte este banco. Por defecto, la ley de EE. UU. */
  readonly regla?: ReglaDelAbono;
}): CardAllocation {
  const regla = input.regla ?? 'ley_eeuu';
  const amount = round2(Math.max(0, Number.isFinite(input.amount) ? input.amount : 0));
  const minimo = round2(Math.max(0, Number.isFinite(input.minimumDue) ? input.minimumDue : 0));
  const minimumPart = Math.min(amount, minimo);
  const excessPart = round2(amount - minimumPart);

  const vivos = input.tramos
    .filter((t) => t.balance > 0)
    .map((t) => ({ tramo: t, tasa: tasaVigente(t, input.hoy) }));

  const restante = new Map(vivos.map((v) => [v.tramo.id, round2(v.tramo.balance)]));
  const delMinimo = new Map<string, number>();
  const delExcedente = new Map<string, number>();

  function abonar(id: string, va: number, destino: Map<string, number>) {
    restante.set(id, round2((restante.get(id) ?? 0) - va));
    destino.set(id, round2((destino.get(id) ?? 0) + va));
  }

  function verter(dinero: number, orden: typeof vivos, destino: Map<string, number>): number {
    let queda = dinero;
    for (const { tramo } of orden) {
      if (queda <= 0) break;
      const debe = restante.get(tramo.id) ?? 0;
      if (debe <= 0) continue;
      const va = round2(Math.min(debe, queda));
      abonar(tramo.id, va, destino);
      queda = round2(queda - va);
    }
    return queda;
  }

  /**
   * En proporción a lo que debe cada tramo. Los centavos que el redondeo deja
   * sueltos van al saldo más grande, que es el último de `orden`: así la suma
   * cuadra exacta y nadie recibe más de lo que debe.
   */
  function repartir(dinero: number, orden: typeof vivos, destino: Map<string, number>): number {
    const conSaldo = orden.filter((v) => (restante.get(v.tramo.id) ?? 0) > 0);
    const total = round2(conSaldo.reduce((s, v) => s + (restante.get(v.tramo.id) ?? 0), 0));
    if (dinero <= 0 || total <= 0) return dinero;
    if (dinero >= total) return verter(dinero, conSaldo, destino);
    let queda = dinero;
    conSaldo.forEach((v, i) => {
      const debe = restante.get(v.tramo.id) ?? 0;
      const parte = i === conSaldo.length - 1 ? queda : Math.floor((dinero * debe * 100) / total) / 100;
      const va = round2(Math.min(debe, queda, parte));
      if (va > 0) abonar(v.tramo.id, va, destino);
      queda = round2(queda - va);
    });
    // Abonando casi el total, el saldo más grande puede no tener sitio para
    // todos los centavos sueltos: van a los demás, que aún deben.
    return queda > 0 ? verter(queda, conSaldo, destino) : 0;
  }

  // La tasa más baja; entre iguales, la promoción que caduca antes, y si no,
  // el saldo más pequeño.
  const porTasaBaja = [...vivos].sort(
    (a, b) =>
      a.tasa - b.tasa ||
      claveCaducidad(a.tramo).localeCompare(claveCaducidad(b.tramo)) ||
      a.tramo.balance - b.tramo.balance,
  );
  // La tasa más alta; entre iguales, el saldo más grande.
  const porTasaAlta = [...vivos].sort((a, b) => b.tasa - a.tasa || b.tramo.balance - a.tramo.balance);

  let paraMinimo = porTasaBaja;
  let paraExcedente = porTasaAlta;
  let sobra: number;
  if (regla === 'proporcional') {
    const porSaldo = [...vivos].sort((a, b) => a.tramo.balance - b.tramo.balance);
    paraMinimo = paraExcedente = [...porSaldo].reverse();
    const sobraMinimo = repartir(minimumPart, porSaldo, delMinimo);
    sobra = repartir(round2(excessPart + sobraMinimo), porSaldo, delExcedente);
  } else {
    if (regla === 'cara_primero') paraMinimo = porTasaAlta;
    if (regla === 'barata_primero') paraExcedente = porTasaBaja;
    if (regla === 'ley_eeuu') {
      // La excepción del diferido: en sus dos últimos ciclos, el excedente va
      // ahí antes que a la tasa más alta; entre dos, al que caduca antes.
      const urgentes = porTasaBaja.filter((v) => diferidoPorCaducar(v.tramo, input.hoy));
      paraExcedente = [...urgentes, ...porTasaAlta.filter((v) => !urgentes.includes(v))];
    }
    // 1. El mínimo. 2. Lo demás; lo que no cupo en el mínimo —tramos ya en
    //    cero— sigue por aquí.
    const sobraMinimo = verter(minimumPart, paraMinimo, delMinimo);
    sobra = verter(round2(excessPart + sobraMinimo), paraExcedente, delExcedente);
  }

  const orden = [...paraMinimo.filter((v) => delMinimo.has(v.tramo.id))];
  for (const v of paraExcedente) if (delExcedente.has(v.tramo.id) && !delMinimo.has(v.tramo.id)) orden.push(v);

  const parts = orden.map(({ tramo, tasa }) => {
    const fromMinimum = delMinimo.get(tramo.id) ?? 0;
    const fromExcess = delExcedente.get(tramo.id) ?? 0;
    return {
      tramoId: tramo.id,
      name: tramo.name,
      amount: round2(fromMinimum + fromExcess),
      fromMinimum,
      fromExcess,
      balanceBefore: round2(tramo.balance),
      balanceAfter: restante.get(tramo.id) ?? 0,
      monthlyRate: tasa,
    };
  });

  return {
    parts,
    minimumPart,
    excessPart,
    applied: round2(amount - sobra),
    overpayment: sobra,
  };
}

/**
 * Lo mínimo que hay que abonar para dejar en cero TODO lo que hoy cobra
 * interés. `null` si nada cobra interés.
 *
 * No es «la suma de los tramos caros»: el mínimo cae primero en el tramo más
 * barato, así que con la 3650 —compras y un adelanto caducado al 23.99 %, otro
 * adelanto al 0 %— hace falta el mínimo MÁS los dos caros. Se busca con el
 * mismo reparto del banco, al centavo, para que el atajo «Sin intereses» de la
 * pantalla diga exactamente lo que hace.
 */
export function montoSinIntereses(
  tramos: readonly CardTramo[],
  minimumDue: number,
  hoy: string,
  regla: ReglaDelAbono = 'ley_eeuu',
): number | null {
  const caros = tramos.filter((t) => t.balance > 0 && tasaVigente(t, hoy) > 0);
  if (caros.length === 0) return null;
  const total = round2(tramos.reduce((s, t) => s + Math.max(0, t.balance), 0));
  const limpio = (amount: number) => {
    const reparto = allocateCardPayment({ tramos, amount, minimumDue, hoy, regla });
    return caros.every((c) => reparto.parts.find((p) => p.tramoId === c.id)?.balanceAfter === 0);
  };
  let lo = 0;
  let hi = Math.round(total * 100);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (limpio(mid / 100)) hi = mid;
    else lo = mid + 1;
  }
  return round2(lo / 100);
}

/**
 * Lo que la tarjeta deja de cobrar de interés cada mes con este abono: lo que
 * cayó en cada tramo por su tasa mensual. Abonar al 0 % no ahorra nada; abonar
 * a compras al 23.99 % sí, y verlo es lo que da sentido a pagar de más.
 */
export function interesAhorradoAlMes(reparto: CardAllocation): number {
  return round2(reparto.parts.reduce((s, p) => s + p.amount * p.monthlyRate, 0));
}

/**
 * «Bank of America ···3650»: el nombre de la tarjeta, sacado de sus tramos.
 *
 * Los tramos se llaman como los llamó el usuario («Compras 3650», «Unlimited
 * Cash 3650»), así que sin últimos dígitos declarados se busca un número de
 * cuatro cifras que lleven TODOS los nombres.
 */
export function cardTitle(
  tramos: readonly { readonly name: string; readonly issuer: string | null; readonly accountLast4: string | null }[],
): string {
  const emisor = tramos.find((t) => t.issuer)?.issuer ?? 'Tarjeta';
  const ultimos = ultimosDeLaTarjeta(tramos);
  return ultimos ? `${emisor} ···${ultimos}` : emisor;
}

/** Los últimos cuatro dígitos de la tarjeta: los declarados, o los que comparten todos los nombres. */
export function ultimosDeLaTarjeta(
  tramos: readonly { readonly name: string; readonly accountLast4: string | null }[],
): string | null {
  const declarados = tramos.find((t) => t.accountLast4)?.accountLast4;
  if (declarados) return declarados;
  const enLosNombres = tramos.map((t) => new Set(t.name.match(/\b\d{4}\b/g) ?? []));
  return [...(enLosNombres[0] ?? [])].find((d) => enLosNombres.every((s) => s.has(d))) ?? null;
}

/**
 * El mínimo que pedirá el banco por la tarjeta entera.
 *
 * La fórmula de Bank of America (ver `additiveMinimumPayment`) sobre la SUMA de
 * los tramos: 1 % del capital, más el interés y las comisiones del ciclo,
 * truncado al dólar, con piso de $35. Contra la 3650: $13,280.02 de capital y
 * $23.24 de interés dan $156.04 → **$156**, lo que pide el estado de septiembre.
 *
 * Es una propuesta: el mínimo de verdad lo trae el estado de cuenta.
 */
export function estimateCardMinimum(
  tramos: readonly { readonly principal: number; readonly interest: number; readonly fees: number }[],
  percent = 1,
  floor = 35,
): number {
  const suma = (k: 'principal' | 'interest' | 'fees') => round2(tramos.reduce((s, t) => s + Math.max(0, t[k]), 0));
  return additiveMinimumPayment(suma('principal'), suma('interest'), percent, floor, suma('fees'));
}
