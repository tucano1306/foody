import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import ModernTitle from '@/components/layout/ModernTitle';
import FinancePlanView from '@/components/finance/FinancePlanView';
import ComputoChip from '@/components/computo/ComputoChip';
import { computoDisponiblePara } from '@/lib/computo/config';
import { getFinancePlan } from '@/lib/finance-data';

export const metadata: Metadata = { title: 'Plan financiero — Foody' };

export default async function PlanPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const data = await getFinancePlan(session.userId);
  // Los cheques se apuntan aquí y entran en Computo: el dueño ve aquí también
  // si llegaron, igual que en Compras y Pagos (lib/computo/config.ts).
  const conComputo = computoDisponiblePara(session.userId);

  return (
    <div className="space-y-5">
      <ModernTitle
        title="Plan financiero"
        subtitle="Tus metas y el camino hasta ellas"
      />
      {conComputo && <ComputoChip />}
      <FinancePlanView initialData={data} />
    </div>
  );
}
