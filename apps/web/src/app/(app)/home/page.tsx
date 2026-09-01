import { Suspense } from 'react';
import { api } from '@/lib/api';
import { getSession } from '@/lib/session';
import DashboardStats from '@/components/home/DashboardStats';
import FrequentProducts from '@/components/home/FrequentProducts';
import ExpensesByStore from '@/components/home/ExpensesByStore';
import StoreVisitsWheel from '@/components/home/StoreVisitsWheel';
import MonthlyFoodWheel from '@/components/home/MonthlyFoodWheel';
import HomeProductsShell from '@/components/home/HomeProductsShell';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import SectionHeader from '@/components/layout/SectionHeader';
import Reveal from '@/components/layout/Reveal';
import GreetingToast from '@/components/home/GreetingToast';
import type { Metadata } from 'next';
import type { Product } from '@foody/types';

export const metadata: Metadata = { title: 'Inicio — Modo Casa' };

/** Placeholder shown while the analytics widgets stream in. */
function ChartsSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="mt-4 h-40 bg-slate-50 dark:bg-slate-800/50 rounded-xl animate-pulse" />
        </div>
      ))}
    </div>
  );
}


export default async function HomePage() {
  const session = await getSession();
  const firstName = session.name?.split(' ')[0] ?? null;

  // Casa ya no pide los pagos: sus tres widgets de finanzas se fueron a sus
  // propias secciones (Pagos, Deudas, Plan financiero) y esta pantalla se
  // ahorra la consulta entera.
  const [products, lastPurchasesRaw, inCartIds]: [Product[], { productId: string; purchasedAt: string; storeName: string | null }[], string[]] = await Promise.all([
    api.products.list().catch(() => [] as Product[]),
    api.shoppingList.lastPurchases().catch(() => []),
    api.shoppingList.inCartProductIds().catch(() => [] as string[]),
  ]);

  const lastPurchaseMap = Object.fromEntries(
    lastPurchasesRaw.map((p) => [p.productId, { purchasedAt: p.purchasedAt, storeName: p.storeName }]),
  );

  const runningLow: Product[] = products.filter((p) => p.stockLevel === 'empty' || p.stockLevel === 'half');

  return (
    <div className="space-y-10">
      {/* ─── Header + Mode Toggle (plain title, consistent with other pages) ── */}
      <div className="space-y-4">
        <GreetingToast firstName={firstName} />
        {/* El subtítulo decía «despensa y pagos»: ya no hay pagos en esta
            pantalla, y prometerlos mandaría a buscar algo que se mudó al menú. */}
        <ModernTitle
          title="🏠 Modo Casa"
          subtitle="Tu despensa y tus compras"
          action={<ModeToggle currentMode="home" />}
        />
      </div>

      {/* ─── Productos primero, luego despensa (headers dentro del shell) ───── */}
      <HomeProductsShell initialProducts={products} lastPurchaseMap={lastPurchaseMap} inCartProductIds={inCartIds} currentUserId={session.userId} />

      {/* ─── Stats y gráficas (resumen, debajo de lo accionable) ────────────── */}
      <Reveal className="space-y-5">
        <SectionHeader
          emoji="📊"
          title="Resumen"
          subtitle="Tus números y gráficas del mes"
          tone="accent"
          centered
        />
        <DashboardStats totalProducts={products.length} runningLowCount={runningLow.length} />

        {/* Charts each hit the DB; stream them in so the actionable content above
            paints immediately instead of waiting on analytics queries. */}
        <Suspense fallback={<ChartsSkeleton />}>
          <FrequentProducts />

          <MonthlyFoodWheel />

          <StoreVisitsWheel />

          <ExpensesByStore />
        </Suspense>
      </Reveal>
    </div>
  );
}
