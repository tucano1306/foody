import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';
import { getSession } from '@/lib/session';
import { listDebts } from '@/lib/debt-data';
import ModernTitle from '@/components/layout/ModernTitle';
import DebtsView from '@/components/debts/DebtsView';

export const metadata: Metadata = { title: 'Deudas y Créditos — Foody' };

export default async function DebtsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const data = await listDebts(session.userId).catch(() => ({
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
  }));

  return (
    <div className="space-y-5">
      <ModernTitle
        title="💳 Deudas y Créditos"
        subtitle="Cuánto debes, cuánto es interés y cuándo quedas libre"
        action={
          <Link
            href="/payments"
            aria-label="Volver a pagos"
            className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-sky-100 transition active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Pagos</span>
          </Link>
        }
      />

      <DebtsView initial={data} />
    </div>
  );
}
