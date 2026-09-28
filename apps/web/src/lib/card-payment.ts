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
 * No aplica aquí la excepción de la ley para promociones de interés DIFERIDO
 * (los dos últimos ciclos antes de caducar, el excedente va a ese tramo): los
 * 0 % de Bank of America son de interés cero de verdad, no diferido.
 *
 * Módulo PURO. Se prueba en card-payment.test.ts.
 */

import { additiveMinimumPayment, round2, toMonthlyRate, type RatePeriod } from './debt-engine';

export interface CardTramo {
  readonly id: string;
  readonly name: string;
  /** Lo que debe este tramo ahora, interés pendiente incluido. */
  readonly balance: number;
  readonly rate: number;
  readonly ratePeriod: RatePeriod;
  /** Último día de su promoción, YYYY-MM-DD. */
  readonly promoEndsOn: string | null;
  /** La tasa que corre desde el día siguiente, en el mismo período que `rate`. */
  readonly rateAfterPromo: number | null;
}

/** ¿Sigue en promoción el día `hoy` (YYYY-MM-DD)? El último día aún cuenta. */
export function enPromocion(tramo: Pick<CardTramo, 'promoEndsOn'>, hoy: string): boolean {
  return tramo.promoEndsOn != null && hoy <= tramo.promoEndsOn.slice(0, 10);
}

/**
 * La tasa mensual que corre HOY en el tramo, en tanto por uno.
 *
 * Una promoción caducada deja de valer su 0 %: desde el día siguiente corre la
 * tasa de después, y es con esa con la que el banco lo ordena.
 */
export function tasaVigente(tramo: CardTramo, hoy: string): number {
  const caducada = tramo.promoEndsOn != null && !enPromocion(tramo, hoy);
  const tasa = caducada && tramo.rateAfterPromo != null ? tramo.rateAfterPromo : tramo.rate;
  return toMonthlyRate(tasa, tramo.ratePeriod);
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
 * cuenta entero como mínimo; lo que lo pasa, como excedente.
 */
export function allocateCardPayment(input: {
  readonly tramos: readonly CardTramo[];
  readonly amount: number;
  readonly minimumDue: number;
  /** Hoy, YYYY-MM-DD: decide qué promociones siguen vivas. */
  readonly hoy: string;
}): CardAllocation {
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

  function verter(dinero: number, orden: typeof vivos, destino: Map<string, number>): number {
    let queda = dinero;
    for (const { tramo } of orden) {
      if (queda <= 0) break;
      const debe = restante.get(tramo.id) ?? 0;
      if (debe <= 0) continue;
      const va = round2(Math.min(debe, queda));
      restante.set(tramo.id, round2(debe - va));
      destino.set(tramo.id, round2((destino.get(tramo.id) ?? 0) + va));
      queda = round2(queda - va);
    }
    return queda;
  }

  // 1. El mínimo, a la tasa más baja; entre iguales, a la promoción que caduca
  //    antes, y si no, al saldo más pequeño.
  const paraMinimo = [...vivos].sort(
    (a, b) =>
      a.tasa - b.tasa ||
      claveCaducidad(a.tramo).localeCompare(claveCaducidad(b.tramo)) ||
      a.tramo.balance - b.tramo.balance,
  );
  const sobraMinimo = verter(minimumPart, paraMinimo, delMinimo);

  // 2. Lo demás, a la tasa más alta; entre iguales, al saldo más grande. Lo que
  //    no cupo en el mínimo —tramos baratos ya en cero— sigue por aquí.
  const paraExcedente = [...vivos].sort((a, b) => b.tasa - a.tasa || b.tramo.balance - a.tramo.balance);
  const sobra = verter(round2(excessPart + sobraMinimo), paraExcedente, delExcedente);

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
  const declarados = tramos.find((t) => t.accountLast4)?.accountLast4;
  const enLosNombres = tramos.map((t) => new Set(t.name.match(/\b\d{4}\b/g) ?? []));
  const comunes = [...(enLosNombres[0] ?? [])].find((d) => enLosNombres.every((s) => s.has(d)));
  const ultimos = declarados ?? comunes;
  return ultimos ? `${emisor} ···${ultimos}` : emisor;
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
