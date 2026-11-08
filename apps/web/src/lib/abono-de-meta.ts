import type { CardStatementInfo, DebtWithProjection, DebtsSnapshot } from './debt-data';
import type { CondicionesDeCredito } from './condiciones-credito';

/**
 * A dónde va el abono que se hace desde una meta enganchada a una deuda.
 *
 * El problema: «Abonar la tarjeta» en una meta del Plan abría el aporte de la
 * meta, que solo sube `saved_amount`. Pero una meta enganchada lee sus cifras
 * DE la deuda (`goalWithDebt`), así que ese aporte se pisaba en la siguiente
 * carga: el usuario apuntaba $200, la tarjeta seguía igual en Deudas y la meta
 * volvía a donde estaba. El abono tiene que entrar en Deudas, como si se
 * hubiera hecho allí; la meta se mueve sola después.
 *
 * - Tramo de una tarjeta con varios saldos → se abona la TARJETA, con el
 *   reparto de su banco. Es lo que pasa con el dinero de verdad: el banco no
 *   deja elegir a qué saldo va. Si cada tramo tiene su meta («Pasar a Metas»
 *   hace una por tramo), todas se mueven según caiga el abono.
 * - Deuda suelta → se abona esa deuda.
 * - Liquidada o ya fuera de Deudas (papelera) → no hay nada que abrir.
 */
export type DestinoDelAbono =
  | {
      readonly tipo: 'tarjeta';
      readonly grupo: string;
      /** Los tramos ACTIVOS con sus saldos enteros, como los pide el modal de Deudas. */
      readonly tramos: DebtWithProjection[];
      readonly estado: CardStatementInfo | null;
      readonly condiciones: CondicionesDeCredito | null;
    }
  | { readonly tipo: 'deuda'; readonly debt: DebtWithProjection }
  | { readonly tipo: 'nada'; readonly motivo: 'no_esta' | 'liquidada' };

export function destinoDelAbono(snapshot: DebtsSnapshot, debtId: string): DestinoDelAbono {
  const debt = snapshot.debts.find((d) => d.id === debtId && d.status !== 'archived');
  if (!debt) return { tipo: 'nada', motivo: 'no_esta' };

  if (debt.cardGroup) {
    const grupo = debt.cardGroup;
    const tramos = snapshot.debts.filter((d) => d.cardGroup === grupo && d.status === 'active');
    // Con un solo tramo activo, Deudas la pinta como deuda suelta y la abona
    // como tal: aquí igual, para que el mismo dinero no tenga dos caminos.
    if (tramos.length > 1) {
      const total = tramos.reduce((s, t) => s + t.currentBalance, 0);
      if (total <= 0) return { tipo: 'nada', motivo: 'liquidada' };
      return {
        tipo: 'tarjeta',
        grupo,
        tramos,
        estado: snapshot.cardStatements?.[grupo] ?? null,
        condiciones: snapshot.creditTerms?.[grupo] ?? null,
      };
    }
  }

  if (debt.status !== 'active' || debt.currentBalance <= 0) return { tipo: 'nada', motivo: 'liquidada' };
  return { tipo: 'deuda', debt };
}
