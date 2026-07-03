import { api } from '@/lib/api';
import FrequentChart from './FrequentChart';

export default async function FrequentProducts() {
  let items: Awaited<ReturnType<typeof api.shoppingList.frequent>> = [];
  try {
    items = await api.shoppingList.frequent();
  } catch {
    // Silently ignore if endpoint not reachable
  }

  if (items.length === 0) return null;

  const top = items.slice(0, 5);

  return (
    <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          📈
        </span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-stone-800 dark:text-stone-100">
            Más comprados
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Tus productos recurrentes para anticipar compras
          </p>
        </div>
      </div>

      <FrequentChart items={top} />
    </section>
  );
}
