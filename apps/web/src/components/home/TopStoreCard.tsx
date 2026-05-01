import { api } from '@/lib/api';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function TopStoreCard() {
  let data: Awaited<ReturnType<typeof api.shoppingTrips.byStore>> = [];
  try {
    data = await api.shoppingTrips.byStore();
  } catch {
    // Silently ignore
  }

  if (data.length === 0) return null;

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  const totalVisits = data.reduce((sum, d) => sum + d.count, 0);
  const pct = totalVisits > 0 ? Math.round((top.count / totalVisits) * 100) : 0;

  return (
    <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm flex flex-col gap-3">
      <div>
        <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
          🏪 Súper más visitado
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">Donde compras con más frecuencia</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-2xl shrink-0 border border-sky-100">
          🛒
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-stone-900 text-lg leading-tight truncate">{top.storeName}</p>
          <p className="text-xs text-stone-500 mt-0.5">
            {top.count} {top.count === 1 ? 'visita' : 'visitas'} · {formatMoney(top.total)} gastados
          </p>
        </div>
      </div>

      {/* Bar showing dominance vs other stores */}
      <div>
        <div className="flex justify-between text-[10px] text-stone-400 mb-1">
          <span>{pct}% de tus visitas</span>
          <span>{data.length} {data.length === 1 ? 'tienda' : 'tiendas'} en total</span>
        </div>
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  );
}
