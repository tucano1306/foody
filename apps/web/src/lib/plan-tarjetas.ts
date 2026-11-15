/**
 * plan-tarjetas.ts — el Plan financiero ve las tarjetas como las ve Deudas.
 *
 * Deudas junta los tramos de una tarjeta («Compras 3650», «Unlimited Cash
 * 3650», «Saldo nuevo 3650») en UNA tarjeta con un solo mínimo. El plan los
 * listaba sueltos, y las dos pantallas parecían hablar de deudas distintas.
 * Además, las metas de deuda escritas a mano repetían la tarjeta con sus
 * propias cifras: «$313 de $11,440» en el plan sobre un saldo que en Deudas
 * ya era otro, y pidiendo dinero al mes por la misma deuda que el plan ya
 * pagaba con su cuota.
 *
 * Aquí está lo que hace que coincidan: agrupar por tarjeta y adivinar a qué
 * deuda se refiere una meta suelta para ofrecer enlazarla de un toque.
 *
 * Módulo PURO. Se prueba en plan-tarjetas.test.ts.
 */

import {
  claveDeCuenta,
  condicionesDeLaCuenta,
  minimoSegunCondiciones,
  type CondicionesDeCredito,
} from './condiciones-credito';
import { round2, type DebtKind, type PayoffStrategy } from './debt-engine';

export type FilaDeCredito<T> =
  | { readonly tipo: 'suelto'; readonly credito: T }
  | { readonly tipo: 'tarjeta'; readonly grupo: string; readonly tramos: readonly T[] };

/**
 * Los créditos en el orden en que llegan, con los tramos de cada tarjeta
 * juntos donde aparece el primero. Un grupo de un solo tramo se pinta suelto,
 * como en Deudas: una tarjeta con un saldo no necesita cabecera.
 */
export function agruparPorTarjeta<T extends { readonly id: string; readonly cardGroup?: string | null }>(
  creditos: readonly T[],
): FilaDeCredito<T>[] {
  const porGrupo = new Map<string, T[]>();
  for (const c of creditos) {
    if (c.cardGroup) porGrupo.set(c.cardGroup, [...(porGrupo.get(c.cardGroup) ?? []), c]);
  }
  const out: FilaDeCredito<T>[] = [];
  const pintados = new Set<string>();
  for (const c of creditos) {
    const tramos = c.cardGroup ? porGrupo.get(c.cardGroup) ?? [] : [];
    if (c.cardGroup && tramos.length > 1) {
      if (pintados.has(c.cardGroup)) continue;
      pintados.add(c.cardGroup);
      out.push({ tipo: 'tarjeta', grupo: c.cardGroup, tramos });
    } else {
      out.push({ tipo: 'suelto', credito: c });
    }
  }
  return out;
}

// ─── A qué deuda se refiere una meta ──────────────────────────────────────────

export interface MetaSinEnlazar {
  readonly name: string;
  readonly kind: string;
  readonly targetAmount: number;
  /** YYYY-MM-DD */
  readonly targetDate: string | null;
  readonly debtId?: string | null;
}

export interface DeudaCandidata {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly accountLast4?: string | null;
  /** YYYY-MM-DD */
  readonly promoEndsOn?: string | null;
}

/** Los números de cuatro cifras de un texto: los últimos dígitos de una tarjeta. */
function digitos(texto: string): Set<string> {
  return new Set(texto.match(/\b\d{4}\b/g) ?? []);
}

/**
 * La deuda que persigue una meta de deuda sin enlazar, si se ve clara.
 *
 * Se puntúa con lo que una persona miraría:
 *   - los últimos dígitos de la tarjeta en el nombre de la meta (+3);
 *   - la fecha de la meta igual al fin de su 0 % (+3): «pagarla antes de que
 *     cobre intereses» es la meta de deuda más común;
 *   - el objetivo a menos de un 5 % del saldo (+2).
 *
 * Solo se propone si la mejor tiene al menos 5 puntos y nadie la empata: con
 * «tarjeta 3650» y tres tramos de la 3650, sin más pistas, cualquiera de los
 * tres sería adivinar. Entonces se pregunta con la lista entera.
 */
export function sugerirDeudaParaMeta<D extends DeudaCandidata>(
  meta: MetaSinEnlazar,
  deudas: readonly D[],
): D | null {
  if (meta.kind !== 'debt' || meta.debtId) return null;
  const enLaMeta = digitos(meta.name);
  const fecha = meta.targetDate?.slice(0, 10) ?? null;

  const puntuadas = deudas
    .filter((d) => d.balance > 0)
    .map((d) => {
      let puntos = 0;
      const suyos = new Set([...digitos(d.name), ...(d.accountLast4 ? [d.accountLast4] : [])]);
      if ([...suyos].some((x) => enLaMeta.has(x))) puntos += 3;
      if (fecha && d.promoEndsOn && d.promoEndsOn.slice(0, 10) === fecha) puntos += 3;
      if (meta.targetAmount > 0 && Math.abs(d.balance - meta.targetAmount) / meta.targetAmount < 0.05) puntos += 2;
      return { deuda: d, puntos };
    })
    .sort((a, b) => b.puntos - a.puntos);

  const [mejor, segunda] = puntuadas;
  if (!mejor || mejor.puntos < 5) return null;
  if (segunda && segunda.puntos === mejor.puntos) return null;
  return mejor.deuda;
}

// ─── Lo que exige el banco ────────────────────────────────────────────────────

/** Lo que hace falta de cada crédito para saber su mínimo. */
export interface CreditoParaMinimo {
  readonly id: string;
  readonly cardGroup: string | null;
  readonly kind: DebtKind;
  readonly strategy: PayoffStrategy;
  readonly balance: number;
  /** La cuota de su estrategia: la que resta el plan. */
  readonly installment: number;
  /** El interés que genera este mes (0 mientras dura un 0 %). */
  readonly monthlyInterest: number;
  readonly issuer: string | null;
  readonly currency: string;
  readonly minPercent: number | null;
  readonly minFloor: number | null;
  readonly minIncludesInterest: boolean;
}

/** Las que tienen un mínimo de banco que se calcula: tarjetas, incluidas las de tienda. */
const ES_TARJETA: ReadonlySet<DebtKind> = new Set<DebtKind>(['credit_card', 'store']);

/**
 * El mínimo que exige el banco de cada crédito este mes, por id.
 *
 * El plan restaba la cuota de la ESTRATEGIA como si fuera una obligación. Con
 * un 0 % que se quiere liquidar antes de que acabe, esa cuota es un plan
 * —«pago de más para llegar a cero a tiempo»—, no algo que exija el banco: una
 * tarjeta de $9,000 al 0 % con tres meses de promoción restaba $3,000 al mes,
 * y el consejero decía «gastas $3,000 más de lo que ingresas» a quien solo
 * debía un mínimo de $90. Separar las dos cifras es lo que deja decir las dos
 * cosas por su nombre.
 *
 * El mínimo sale de las condiciones de la cuenta, con las MISMAS funciones que
 * usa Deudas (`condicionesDeLaCuenta` + `minimoSegunCondiciones`): las dos
 * pantallas no pueden decir mínimos distintos. Es una estimación del próximo
 * estado —el saldo como base y el interés que genera el mes—; el de verdad lo
 * trae el estado de cuenta.
 *
 * En una tarjeta con tramos el mínimo es de la CUENTA, uno solo; se reparte
 * entre sus tramos por saldo para que el plan, que va crédito a crédito, sume
 * lo mismo que Deudas.
 *
 * Nunca pasa de la cuota del crédito: lo que el plan resta es la cuota, y la
 * diferencia entre las dos es «lo que el usuario decide abonar de más», que no
 * puede salir negativa. Por la misma razón, una deuda en «mínimo» declara su
 * cuota entera como mínimo, y un préstamo, cuya cuota ya es la del contrato,
 * también.
 */
export function minimosDelBanco(
  creditos: readonly CreditoParaMinimo[],
  guardadas: ReadonlyMap<string, CondicionesDeCredito>,
): Map<string, number> {
  const out = new Map<string, number>();
  const cuentas = new Map<string, CreditoParaMinimo[]>();
  for (const c of creditos) {
    const clave = claveDeCuenta(c);
    cuentas.set(clave, [...(cuentas.get(clave) ?? []), c]);
  }

  for (const [clave, tramos] of cuentas) {
    const conCuota = (c: CreditoParaMinimo) => round2(Math.max(0, c.installment));
    const tarjeta = tramos.filter((t) => ES_TARJETA.has(t.kind));
    for (const t of tramos) if (!ES_TARJETA.has(t.kind)) out.set(t.id, conCuota(t));
    if (tarjeta.length === 0) continue;

    // Misma búsqueda que Deudas: por la cuenta y, si no, por cualquiera de sus
    // tramos, para que una tarjeta suelta con condiciones guardadas no las
    // pierda el día que se le junta un tramo.
    const fila = guardadas.get(clave) ?? tarjeta.map((t) => guardadas.get(t.id)).find(Boolean) ?? null;
    const condiciones = condicionesDeLaCuenta(tarjeta, fila);
    const minimoDeLaCuenta = minimoSegunCondiciones(
      condiciones,
      tarjeta.map((t) => ({ principal: Math.max(0, t.balance), interest: Math.max(0, t.monthlyInterest), fees: 0 })),
    );
    const saldoTotal = tarjeta.reduce((s, t) => s + Math.max(0, t.balance), 0);

    for (const t of tarjeta) {
      if (t.strategy === 'minimum') {
        out.set(t.id, conCuota(t));
        continue;
      }
      const parte = saldoTotal > 0 ? (minimoDeLaCuenta * Math.max(0, t.balance)) / saldoTotal : 0;
      out.set(t.id, round2(Math.min(conCuota(t), parte)));
    }
  }
  return out;
}
