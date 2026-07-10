import { getStoresAggregate } from '@/lib/home-queries';
import StoreExpensesChart from './StoreExpensesChart';

export default async function ExpensesByStore() {
  let data: Awaited<ReturnType<typeof getStoresAggregate>> = [];
  try {
    data = await getStoresAggregate();
  } catch {
    // Silently ignore
  }

  if (data.length === 0) return null;
  const total = data.reduce((sum, d) => sum + d.total, 0);
  if (total === 0) return null;

  return (
    <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          💸
        </span>
        <div className="min-w-0 text-center">
          <h2 className="text-base sm:text-lg font-bold text-stone-800 dark:text-stone-100">
            Gastos por supermercado
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Cuánto llevas gastado en cada tienda
          </p>
        </div>
      </div>

      <StoreExpensesChart data={data} />
    </section>
  );
}
