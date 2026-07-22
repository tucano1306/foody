import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/session';
import ModernTitle from '@/components/layout/ModernTitle';
import FinancePlanView from '@/components/finance/FinancePlanView';
import { getFinancePlan } from '@/lib/finance-data';

export const metadata: Metadata = { title: 'Plan financiero — Foody' };

export default async function PlanPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  const data = await getFinancePlan(session.userId);

  return (
    <div className="space-y-5">
      <ModernTitle
        title="🧭 Plan financiero"
        subtitle="Tus metas, tus deudas y el plan mes a mes para lograrlas"
      />
      <FinancePlanView initialData={data} />
    </div>
  );
}
