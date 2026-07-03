import { Suspense } from 'react';
import { api } from '@/lib/api';
import { getSession } from '@/lib/session';
import UpcomingPaymentsWidget from '@/components/home/UpcomingPaymentsWidget';
import DashboardStats from '@/components/home/DashboardStats';
import FrequentProducts from '@/components/home/FrequentProducts';
import ExpensesByStore from '@/components/home/ExpensesByStore';
import StoreVisitsWheel from '@/components/home/StoreVisitsWheel';
import MonthlyFoodWheel from '@/components/home/MonthlyFoodWheel';
import HomeProductsShell from '@/components/home/HomeProductsShell';
import MonthlyExpenseSummary from '@/components/home/MonthlyExpenseSummary';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import SectionHeader from '@/components/layout/SectionHeader';
import GreetingToast from '@/components/home/GreetingToast';
import type { Metadata } from 'next';
import type { Product, MonthlyPayment } from '@foody/types';

export const metadata: Metadata = { title: 'Inicio — Modo Casa' };

/** Placeholder shown while the analytics widgets stream in. */
function ChartsSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 animate-pulse" />
            <div className="h-4 w-48 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
          </div>
          <div className="mt-4 h-40 bg-stone-50 dark:bg-stone-800/50 rounded-xl animate-pulse" />
        </div>
      ))}
    </div>
  );
}


export default async function HomePage() {
  const session = await getSession();
  const firstName = session.name?.split(' ')[0] ?? null;

  const [products, payments, lastPurchasesRaw]: [Product[], MonthlyPayment[], { productId: string; purchasedAt: string; storeName: string | null }[]] = await Promise.all([
    api.products.list().catch(() => [] as Product[]),
    api.payments.list().catch(() => [] as MonthlyPayment[]),
    api.shoppingList.lastPurchases().catch(() => []),
  ]);

  const lastPurchaseMap = Object.fromEntries(
    lastPurchasesRaw.map((p) => [p.productId, { purchasedAt: p.purchasedAt, storeName: p.storeName }]),
  );

  const runningLow: Product[] = products.filter((p) => p.stockLevel === 'empty' || p.stockLevel === 'half');
  const upcomingPayments = payments
    .filter((p) => !p.isPaidThisMonth && p.daysUntilDue <= 30)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-10">
      {/* ─── Header + Mode Toggle ───────────────────────────────────────────── */}
      <div className="relative bg-brand-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg">
        <GreetingToast firstName={firstName} />
        <ModernTitle
          title="🏠 Modo Casa"
          subtitle="Gestiona tu despensa y pagos"
          onDark
          action={<ModeToggle currentMode="home" onDark />}
        />
      </div>

      {/* ─── Despensa (lo más accionable: agotados → poco → todos) ──────────── */}
      <section className="space-y-5">
        <SectionHeader emoji="🥑" title="Mi despensa" />
        <HomeProductsShell initialProducts={products} lastPurchaseMap={lastPurchaseMap} />
      </section>

      {/* ─── Pagos próximos ─────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader emoji="💰" title="Finanzas" />
        <UpcomingPaymentsWidget payments={upcomingPayments} />
      </section>

      {/* ─── Stats y gráficas (resumen, debajo de lo accionable) ────────────── */}
      <section className="space-y-5">
        <SectionHeader emoji="📊" title="Resumen y estadísticas" />
        <DashboardStats
          totalProducts={products.length}
          runningLowCount={runningLow.length}
          upcomingPaymentsCount={upcomingPayments.length}
          totalMonthlyExpenses={totalExpenses}
        />

        {/* Charts each hit the DB; stream them in so the actionable content above
            paints immediately instead of waiting on analytics queries. */}
        <Suspense fallback={<ChartsSkeleton />}>
          <FrequentProducts />

          <MonthlyExpenseSummary />

          <MonthlyFoodWheel />

          <StoreVisitsWheel />

          <ExpensesByStore />
        </Suspense>
      </section>
    </div>
  );
}
