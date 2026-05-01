import { api } from '@/lib/api';
import { getSession } from '@/lib/session';
import PaymentCard from '@/components/payments/PaymentCard';
import DashboardStats from '@/components/home/DashboardStats';
import FrequentProducts from '@/components/home/FrequentProducts';
import ExpensesByCategory from '@/components/home/ExpensesByCategory';
import ExpensesByStore from '@/components/home/ExpensesByStore';
import StoreVisitsWheel from '@/components/home/StoreVisitsWheel';
import MonthlyFoodWheel from '@/components/home/MonthlyFoodWheel';
import HomeProductsShell from '@/components/home/HomeProductsShell';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import GreetingToast from '@/components/home/GreetingToast';
import type { Metadata } from 'next';
import type { Product, MonthlyPayment } from '@foody/types';

export const metadata: Metadata = { title: 'Inicio — Modo Casa' };

function getGreeting(h: number): string {
  if (h >= 5 && h < 12) return '¡Buenos días';
  if (h >= 12 && h < 19) return '¡Buenas tardes';
  return '¡Buenas noches';
}

function getGreetingEmoji(h: number): string {
  if (h >= 5 && h < 12) return '🌅';
  if (h >= 12 && h < 19) return '☀️';
  return '🌙';
}

export default async function HomePage() {
  const session = await getSession();
  const firstName = session.name?.split(' ')[0] ?? null;

  const hour = new Date().getHours();
  const greeting = getGreeting(hour);
  const greetingEmoji = getGreetingEmoji(hour);
  const greetingText = firstName
    ? `${greeting}, ${firstName}! ${greetingEmoji}`
    : `${greeting}! ${greetingEmoji}`;

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
    .filter((p) => !p.isPaidThisMonth && p.daysUntilDue <= 7)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-8">
      {/* ─── Header + Mode Toggle ───────────────────────────────────────────── */}
      <div className="relative bg-brand-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg">
        <GreetingToast greeting={greetingText} />
        <ModernTitle
          title="🏠 Modo Casa"
          subtitle="Gestiona tu despensa y pagos"
          onDark
          action={<ModeToggle currentMode="home" onDark />}
        />
      </div>

      {/* ─── Stats ─────────────────────────────────────────────────────────── */}
      <DashboardStats
        totalProducts={products.length}
        runningLowCount={runningLow.length}
        upcomingPaymentsCount={upcomingPayments.length}
        totalMonthlyExpenses={totalExpenses}
      />

      <FrequentProducts />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StoreVisitsWheel />
        <MonthlyFoodWheel />
      </div>

      <ExpensesByCategory />

      <ExpensesByStore />

      <HomeProductsShell initialProducts={products} lastPurchaseMap={lastPurchaseMap} />

      {/* ─── Pagos próximos ─────────────────────────────────────────────────── */}
      <section className="bg-gray-900 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            💳 Pagos próximos
          </h2>
          <a href="/payments" className="text-sm text-gray-400 hover:text-white transition-colors">
            Ver todos →
          </a>
        </div>
        {upcomingPayments.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">
            No hay pagos urgentes esta semana 🎉
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {upcomingPayments.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
