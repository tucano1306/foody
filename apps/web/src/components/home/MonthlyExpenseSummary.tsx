import { api } from '@/lib/api';
import Link from 'next/link';

function fmt(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function MonthlyExpenseSummary() {
  const [payments, trips] = await Promise.all([
    api.payments.list().catch(() => []),
    api.shoppingTrips.list().catch(() => []),
  ]);

  const now = new Date();
  // Rolling 30-day window: a calendar-month cutoff shows $0 during the first
  // days of each month even with recent purchases, which reads as a bug.
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 30);

  const recurringTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const paidRecurringTotal = payments.filter((p) => p.isPaidThisMonth).reduce((sum, p) => sum + p.amount, 0);
  const recentTrips = trips.filter((t) => new Date(t.purchasedAt) >= windowStart);
  const supermarketTotal = recentTrips.reduce((sum, t) => sum + t.totalAmount, 0);
  const grandTotal = recurringTotal + supermarketTotal;

  const tripCount = recentTrips.length;

  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-linear-to-r from-brand-700 to-brand-500 px-5 py-4">
        <p className="text-white font-bold text-base">💸 Resumen del mes</p>
        <p className="text-white/70 text-xs mt-0.5">
          {now.toLocaleString('es-MX', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Breakdown rows */}
      <div className="divide-y divide-stone-100 dark:divide-stone-800">
        {/* Recurring */}
        <Link
          href="/payments"
          className="flex items-center justify-between px-5 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">💳</span>
            <div>
              <p className="text-stone-700 dark:text-stone-200 text-sm font-semibold">Pagos recurrentes</p>
              <p className="text-stone-400 dark:text-stone-500 text-xs">
                {fmt(paidRecurringTotal)} pagado de {fmt(recurringTotal)}
              </p>
            </div>
          </div>
          <p className="text-stone-800 dark:text-white font-bold text-sm">{fmt(recurringTotal)}</p>
        </Link>

        {/* Supermarket */}
        <Link
          href="/shopping-trips"
          className="flex items-center justify-between px-5 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🛒</span>
            <div>
              <p className="text-stone-700 dark:text-stone-200 text-sm font-semibold">Supermercado</p>
              <p className="text-stone-400 dark:text-stone-500 text-xs">
                {tripCount} {tripCount === 1 ? 'visita' : 'visitas'} · últimos 30 días
              </p>
            </div>
          </div>
          <p className="text-stone-800 dark:text-white font-bold text-sm">{fmt(supermarketTotal)}</p>
        </Link>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between px-5 py-4 bg-stone-50 dark:bg-stone-800/50">
        <p className="text-stone-600 dark:text-stone-300 font-semibold text-sm">Total estimado del mes</p>
        <p className="text-brand-700 dark:text-brand-400 font-extrabold text-lg">{fmt(grandTotal)}</p>
      </div>
    </div>
  );
}
