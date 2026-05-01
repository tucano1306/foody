import { api } from '@/lib/api';
import StoreVisitsChart from './StoreVisitsChart';

export default async function StoreVisitsWheel() {
  let data: Awaited<ReturnType<typeof api.shoppingTrips.byStore>> = [];
  try {
    data = await api.shoppingTrips.byStore();
  } catch {
    // Silently ignore
  }

  if (data.length === 0) return null;
  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  if (totalVisits === 0) return null;

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
      <StoreVisitsChart data={data} />
    </section>
  );
}
