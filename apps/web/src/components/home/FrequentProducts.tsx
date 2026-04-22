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
    <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            📈 Más comprados
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Tus productos recurrentes para anticipar compras
          </p>
        </div>
      </div>

      <FrequentChart items={top} />
    </section>
  );
}
