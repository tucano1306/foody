/**
 * fuera-del-plan.ts — quitar una tarjeta del Plan sin tocarla en Deudas.
 *
 * El 7 nov 2026 el dueño quiso sacar sus tarjetas del Plan financiero («no son
 * metas») y lo único que había era «Borrar esta deuda», que se las llevó
 * también de Deudas con todo su historial. Quitar del Plan es otra cosa: una
 * preferencia de lo que el Plan ENSEÑA, guardada aparte
 * (`plan_hidden_accounts`), que no escribe ni una fila de `debts`.
 *
 * Lo que NO cambia al quitarla: el dinero. Su cuota sigue restando en
 * «Tarjetas y créditos» del flujo del mes, porque ese pago sigue saliendo de
 * la cuenta; esconderlo inflaría el dinero libre y el plan repartiría entre
 * metas lo que ya va al banco. El motor (`finance-engine.ts`) ni se entera.
 *
 * Se quita la CUENTA entera, no un tramo: una tarjeta con tres saldos sale o
 * se queda con los tres. Por eso la clave es la de la cuenta (`card_group`, o
 * el id de la deuda suelta), igual que en `credit_terms`, y se busca también
 * por el id de cada tramo: una tarjeta suelta que se quitó del Plan no vuelve
 * a aparecer el día que se le junta un tramo nuevo y pasa a tener grupo.
 *
 * Módulo PURO. Se prueba en fuera-del-plan.test.ts.
 */

import { claveDeCuenta } from './condiciones-credito';

interface ConCuenta {
  readonly id: string;
  readonly cardGroup: string | null;
}

/**
 * Los ids de los créditos que el Plan no enseña: todos los tramos de cada
 * cuenta cuya clave, o el id de alguno de sus tramos, está en `ocultas`.
 */
export function idsFueraDelPlan(creditos: readonly ConCuenta[], ocultas: ReadonlySet<string>): Set<string> {
  if (ocultas.size === 0) return new Set();
  const porCuenta = new Map<string, ConCuenta[]>();
  for (const c of creditos) {
    const clave = claveDeCuenta(c);
    porCuenta.set(clave, [...(porCuenta.get(clave) ?? []), c]);
  }
  const fuera = new Set<string>();
  for (const [clave, tramos] of porCuenta) {
    if (ocultas.has(clave) || tramos.some((t) => ocultas.has(t.id))) {
      for (const t of tramos) fuera.add(t.id);
    }
  }
  return fuera;
}

/**
 * Las claves que hay que borrar de `plan_hidden_accounts` para devolver una
 * cuenta al Plan: la suya y la de cada tramo. Si solo se borrara la de la
 * cuenta, una fila vieja con el id de un tramo la seguiría escondiendo.
 */
export function clavesDeLaCuenta(tramos: readonly ConCuenta[]): string[] {
  const claves = new Set<string>();
  for (const t of tramos) {
    claves.add(claveDeCuenta(t));
    claves.add(t.id);
  }
  return [...claves];
}

interface Resumible {
  readonly balance: number;
  readonly installment: number;
  readonly monthlyInterest: number;
  readonly countedInPayments: boolean;
}

export interface ResumenVisible {
  readonly balance: number;
  readonly monthlyInterest: number;
  /** Lo que el Plan aparta al mes para estas cuentas, sin lo que ya cobra un recibo de Pagos. */
  readonly payments: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Los totales de la sección «Tarjetas y créditos» con solo lo que se ve.
 *
 * El motor suma todas las cuentas, también las quitadas del Plan (el dinero es
 * real). Pero si la cabecera dijera ese total sobre una lista más corta, las
 * filas no sumarían lo que dice arriba y parecería un error de la app. Las
 * sumas son las mismas que hace `buildDebtOverview`: sin nada quitado, salen
 * idénticas a las del motor.
 */
export function resumenDeLoVisible(filas: readonly Resumible[]): ResumenVisible {
  return {
    balance: round2(filas.reduce((s, c) => s + c.balance, 0)),
    monthlyInterest: round2(filas.reduce((s, c) => s + c.monthlyInterest, 0)),
    payments: round2(filas.filter((c) => !c.countedInPayments).reduce((s, c) => s + c.installment, 0)),
  };
}
