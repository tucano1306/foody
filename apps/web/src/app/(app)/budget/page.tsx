import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import ModernTitle from '@/components/layout/ModernTitle';
import BudgetView from '@/components/budget/BudgetView';
import { getBudgetData } from '@/lib/budget-data';
import type { Metadata } from 'next';
import type { ScopeFilter } from '@/lib/expense-scope';

export const metadata: Metadata = { title: 'Presupuesto — Foody' };

/** El ambito pedido por la URL, o «todo» si no viene o no se entiende. */
function readScope(raw: string | undefined): ScopeFilter {
  return raw === 'personal' || raw === 'business' ? raw : 'all';
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  // El Plan financiero enlaza aqui con el ambito puesto.
  const { scope } = await searchParams;
  const data = await getBudgetData(session.userId);

  return (
    <div className="space-y-5">
      <ModernTitle title="💰 Presupuesto" subtitle="Controla tu gasto mensual en el supermercado" />
      <BudgetView initialData={data} initialScope={readScope(scope)} />
    </div>
  );
}
