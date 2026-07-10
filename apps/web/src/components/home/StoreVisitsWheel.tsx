import { getStoresAggregate } from '@/lib/home-queries';
import StoreVisitsChart from './StoreVisitsChart';

export default async function StoreVisitsWheel() {
  let data: Awaited<ReturnType<typeof getStoresAggregate>> = [];
  try {
    data = await getStoresAggregate();
  } catch {
    // Silently ignore
  }

  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  const hasData = data.length > 0 && totalVisits > 0;

  return (
    <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          🏪
        </span>
        <div className="min-w-0 text-center">
          <h2 className="text-base sm:text-lg font-bold text-stone-800 dark:text-stone-100">
            Supermercados más visitados
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Dónde compras con más frecuencia
          </p>
        </div>
      </div>
      {hasData ? (
        <StoreVisitsChart data={data} />
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-stone-300">
          <span className="text-5xl mb-3">🛒</span>
          <p className="text-sm font-medium text-stone-400">Sin tickets registrados</p>
          <p className="text-xs text-stone-300 mt-1">Registra una compra para ver estadísticas</p>
        </div>
      )}
    </section>
  );
}
