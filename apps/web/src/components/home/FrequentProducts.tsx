import { api } from '@/lib/api';
import FrequentChart from './FrequentChart';
import ChartZoom from './ChartZoom';

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
    <section className="relative bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          📈
        </span>
        <div className="min-w-0 text-center">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
            Más comprados
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tus productos recurrentes para anticipar compras
          </p>
        </div>
      </div>

      <ChartZoom title="Más comprados">
        <FrequentChart items={top} />
      </ChartZoom>
    </section>
  );
}
