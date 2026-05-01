import { api } from '@/lib/api';
import StoreVisitsChart from './StoreVisitsChart';

export default async function StoreVisitsWheel() {
  let data: Awaited<ReturnType<typeof api.shoppingTrips.byStore>> = [];
  try {
    data = await api.shoppingTrips.byStore();
  } catch {
    // Silently ignore
  }

  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  const hasData = data.length > 0 && totalVisits > 0;

  return (
    <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
          🏪 Súper más visitado
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Visitas a cada tienda según tus tickets
        </p>
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
