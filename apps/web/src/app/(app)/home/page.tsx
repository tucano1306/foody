import { api } from '@/lib/api';
import ProductCard from '@/components/products/ProductCard';
import ProductsBrowser from '@/components/products/ProductsBrowser';
import PaymentCard from '@/components/payments/PaymentCard';
import DashboardStats from '@/components/home/DashboardStats';
import FrequentProducts from '@/components/home/FrequentProducts';
import ExpensesByCategory from '@/components/home/ExpensesByCategory';
import ExpensesByStore from '@/components/home/ExpensesByStore';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Inicio — Modo Casa' };

export default async function HomePage() {
  const [products, payments] = await Promise.all([
    api.products.list(),
    api.payments.list(),
  ]);

  const empty = products.filter((p) => p.stockLevel === 'empty');
  const low = products.filter((p) => p.stockLevel === 'half');
  const runningLow = [...empty, ...low];
  const upcomingPayments = payments
    .filter((p) => !p.isPaidThisMonth && p.daysUntilDue <= 7)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-8">
      {/* ─── Header + Mode Toggle ───────────────────────────────────────────── */}
      <div className="bg-brand-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg">
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

      <ExpensesByCategory />

      <ExpensesByStore />

      {/* ─── Productos que se acabaron (urgente) ───────────────────────────── */}
      {empty.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-rose-700 mb-4 flex items-center gap-2">
            <span>🚨</span> Se acabó — prioridad ({empty.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {empty.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Productos con bajo stock ───────────────────────────────────────── */}
      {low.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-amber-700 mb-4 flex items-center gap-2">
            <span>⚠️</span> Queda poco ({low.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {low.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}      {/* ─── Todos los productos ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-base sm:text-xl font-semibold text-stone-700 min-w-0 truncate">
            <span className="sm:hidden">🛒 Productos ({products.length})</span>
            <span className="hidden sm:inline">🛒 Todos los productos ({products.length})</span>
          </h2>
          <a
            href="/products/new"
            aria-label="Agregar producto"
            className="shrink-0 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            <span className="sm:hidden">+ Nuevo</span>
            <span className="hidden sm:inline">+ Agregar</span>
          </a>
        </div>
        {products.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <p className="text-5xl mb-4">🥑</p>
            <p className="text-lg font-medium">No hay productos todavía</p>
            <a href="/products/new" className="mt-3 inline-block text-brand-500 hover:underline">
              Agrega tu primer producto
            </a>
          </div>
        ) : (
          <ProductsBrowser products={products} pageSize={12} />
        )}
      </section>

      {/* ─── Pagos próximos ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-stone-700">
            💳 Pagos próximos
          </h2>
          <a href="/payments" className="text-sm text-brand-500 hover:underline">
            Ver todos →
          </a>
        </div>
        {upcomingPayments.length === 0 ? (
          <p className="text-stone-400 text-sm py-4">
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
