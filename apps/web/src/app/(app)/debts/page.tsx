import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { listDebts } from '@/lib/debt-data';
import type { ObligationPayment } from '@/lib/duplicate-obligations';
import ModernTitle from '@/components/layout/ModernTitle';
import DebtsView from '@/components/debts/DebtsView';

export const metadata: Metadata = { title: 'Deudas y Créditos — Foody' };

/**
 * Los recibos mensuales, solo con lo que hace falta para detectar la cuota
 * anotada dos veces. Se piden aquí y no desde el cliente: es una lista corta y
 * el servidor ya está hablando con la base.
 */
async function listPaymentsForDuplicateCheck(userId: string): Promise<ObligationPayment[]> {
  const rows = await sql`
    SELECT id, name, amount FROM monthly_payments
    WHERE user_id = ${userId} AND is_active = true
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    amount: Number.parseFloat(String(r.amount ?? '0')) || 0,
  }));
}

export default async function DebtsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const [data, payments] = await Promise.all([
    listDebts(session.userId).catch(() => ({
      debts: [],
      portfolio: {
        totalBalance: 0,
        totalMonthlyInterest: 0,
        totalMonthlyCommitment: 0,
        avalanche: [],
        snowball: [],
        costliest: null,
        stuck: [],
        freeDate: null,
      },
    })),
    // Si falla, la sección funciona igual: solo se pierde la detección.
    listPaymentsForDuplicateCheck(session.userId).catch(() => [] as ObligationPayment[]),
  ]);

  return (
    <div className="space-y-5">
      {/* Sin botón «volver a Pagos»: Deudas ya no cuelga de Pagos, es una
          sección propia con su entrada en el menú. */}
      <ModernTitle
        title="💳 Deudas y Créditos"
        subtitle="Cuánto debes, cuánto es interés y cuándo quedas libre"
      />

      <DebtsView initial={data} payments={payments} />
    </div>
  );
}
