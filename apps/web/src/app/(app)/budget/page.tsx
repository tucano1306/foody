import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import ModernTitle from '@/components/layout/ModernTitle';
import BudgetView from '@/components/budget/BudgetView';
import { getBudgetData } from '@/lib/budget-data';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Presupuesto — Foody' };

export default async function BudgetPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const data = await getBudgetData(session.userId);

  return (
    <div className="space-y-5">
      <ModernTitle title="💰 Presupuesto" subtitle="Controla tu gasto mensual en el supermercado" />
      <BudgetView initialData={data} />
    </div>
  );
}
