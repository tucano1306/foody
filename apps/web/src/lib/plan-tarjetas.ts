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
