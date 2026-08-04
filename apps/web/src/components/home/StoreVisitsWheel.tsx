import { getStoresAggregate } from '@/lib/home-queries';
import StoreVisitsChart from './StoreVisitsChart';
import ChartZoom from './ChartZoom';

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
    <section className="relative bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          🏪
        </span>
        <div className="min-w-0 text-center">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
            Supermercados más visitados
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dónde compras con más frecuencia
          </p>
        </div>
      </div>
      {hasData ? (
        <ChartZoom title="Supermercados más visitados">
          <StoreVisitsChart data={data} />
        </ChartZoom>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-slate-300">
          <span className="text-5xl mb-3">🛒</span>
          <p className="text-sm font-medium text-slate-400">Sin tickets registrados</p>
          <p className="text-xs text-slate-300 mt-1">Registra una compra para ver estadísticas</p>
        </div>
      )}
    </section>
  );
}
