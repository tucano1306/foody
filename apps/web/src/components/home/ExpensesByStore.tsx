import { api } from '@/lib/api';
import StoreExpensesChart from './StoreExpensesChart';

export default async function ExpensesByStore() {
  let data: Awaited<ReturnType<typeof api.shoppingTrips.byStore>> = [];
  try {
    data = await api.shoppingTrips.byStore();
  } catch {
    // Silently ignore
  }

  if (data.length === 0) return null;
  const total = data.reduce((sum, d) => sum + d.total, 0);
  if (total === 0) return null;

  return (
    <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
          🏪 Gastos por supermercado
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Total gastado en cada tienda según tus tickets
        </p>
      </div>

      <StoreExpensesChart data={data} />
    </section>
  );
}
