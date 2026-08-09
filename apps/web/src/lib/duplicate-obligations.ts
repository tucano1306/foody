/**
 * duplicate-obligations.ts — el mismo pago anotado dos veces.
 *
 * Pagos y Deudas son dos tablas independientes, y con razón: una lleva el
 * recordatorio mensual (día de cobro, pagado o no), la otra lleva el saldo, el
 * interés y la fecha de liquidación. La cuota del coche merece estar en las dos.
 *
 * El problema es que el Plan Financiero resta las dos por separado, así que ese
 * dinero sale de la cuenta dos veces. Con la cuota del GMC a $1.097 el plan
 * creía que el negocio gasta $3.411 al mes cuando gasta $2.314, y nada en la
 * pantalla explicaba de dónde salía la diferencia.
 *
 * Este módulo solo SOSPECHA. Emparejar en silencio dos obligaciones distintas
 * que casualmente cuestan lo mismo sería peor que el bug: escondería dinero
 * real. La decisión la toma el usuario y se guarda en `debts.linked_payment_id`.
 *
 * Módulo PURO: sin SQL, sin React. Se prueba en duplicate-obligations.test.ts.
 */

export interface ObligationPayment {
  id: string;
  name: string;
  amount: number;
}

export interface ObligationDebt {
  id: string;
  name: string;
  issuer: string | null;
  installment: number;
  /** Ya resuelto por el usuario: apunta al pago mensual que lo cubre. */
  linkedPaymentId?: string | null;
  /** El usuario dijo que NO son el mismo: no volver a preguntar. */
  duplicateDismissed?: boolean;
}

export interface DuplicateSuspect {
  debtId: string;
  debtName: string;
  paymentId: string;
  paymentName: string;
  /** El importe que se está contando dos veces. */
  amount: number;
  /** 'amount' = solo coincide la cifra; 'name' = además se parecen los nombres. */
  reason: 'amount' | 'name';
}

/**
 * Tolerancia al comparar importes.
 *
 * Un centavo de diferencia entre lo que dice el recibo y lo que calcula la
 * amortización no convierte dos cosas en distintas.
 */
const CENTS = 0.5;

/** Normaliza para comparar nombres: minúsculas, sin acentos ni puntuación. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * ¿Se parecen los nombres lo bastante como para reforzar la sospecha?
 *
 * No es difuso a propósito: basta con que uno contenga al otro, o que
 * compartan una palabra de 3+ letras. «GMC» contra «Auto (GMC)» tiene que dar
 * true; «Oscar» contra «Visa» tiene que dar false.
 */
export function namesLookRelated(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  if (x.length === 0 || y.length === 0) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;

  const words = new Set(x.split(' ').filter((w) => w.length >= 3));
  return y.split(' ').some((w) => w.length >= 3 && words.has(w));
}

/**
 * Cuotas de deuda que ya podrían estar cobradas como pago mensual.
 *
 * Cada pago se empareja como mucho con UNA deuda: dos recibos de $1.097 no
 * cubren la misma cuota, y al revés tampoco. Gana el candidato cuyo nombre se
 * parece más, y a igualdad, el primero.
 */
export function findDuplicateObligations(
  payments: readonly ObligationPayment[],
  debts: readonly ObligationDebt[],
): DuplicateSuspect[] {
  const out: DuplicateSuspect[] = [];
  const usedPayments = new Set<string>();

  // Las que se parecen por nombre van primero: así se quedan con su pago antes
  // de que se lo lleve otra que solo coincide en la cifra.
  const candidates: (DuplicateSuspect & { score: number })[] = [];

  for (const debt of debts) {
    // Ya resuelto en un sentido o en el otro: no se vuelve a preguntar.
    if (debt.linkedPaymentId || debt.duplicateDismissed) continue;
    if (!(debt.installment > 0)) continue;

    for (const payment of payments) {
      if (!(payment.amount > 0)) continue;
      if (Math.abs(payment.amount - debt.installment) > CENTS) continue;

      const related =
        namesLookRelated(debt.name, payment.name) ||
        (debt.issuer !== null && namesLookRelated(debt.issuer, payment.name));

      candidates.push({
        debtId: debt.id,
        debtName: debt.name,
        paymentId: payment.id,
        paymentName: payment.name,
        amount: Math.round(debt.installment * 100) / 100,
        reason: related ? 'name' : 'amount',
        score: related ? 1 : 0,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedDebts = new Set<string>();
  for (const c of candidates) {
    if (usedPayments.has(c.paymentId) || usedDebts.has(c.debtId)) continue;
    usedPayments.add(c.paymentId);
    usedDebts.add(c.debtId);
    const { score: _score, ...suspect } = c;
    out.push(suspect);
  }

  return out;
}
