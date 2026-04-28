import { api } from '@/lib/api';
import SupermarketView from '@/components/shopping/SupermarketView';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Supermercado' };

export default async function SupermarketPage() {
  const [items, topStores, frequentProducts] = await Promise.all([
    api.shoppingList.get(),
    api.shoppingTrips.byStore().catch(() => []),
    api.shoppingList.frequent().catch(() => []),
  ]);

  const topStore = topStores.length > 0 ? topStores.sort((a, b) => b.count - a.count)[0] : null;
  const topProduct = frequentProducts.length > 0 ? frequentProducts[0] : null;

  return (
    <div className="space-y-6">
      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-brand-700 text-white rounded-2xl p-5 sm:p-6 shadow-lg">
        <ModernTitle
          title="🛒 Modo Supermercado"
          subtitle={`${items.length} producto${items.length === 1 ? '' : 's'} para comprar`}
          onDark
          action={<ModeToggle currentMode="supermarket" onDark />}
        />
      </div>

      {/* ─── Quick stats ────────────────────────────────────────────────────── */}
      {(topStore ?? topProduct) && (
        <div className="grid grid-cols-2 gap-3">
          {topStore && (
            <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm flex flex-col gap-1">
              <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">🏪 Super favorito</span>
              <span className="font-bold text-stone-800 truncate">{topStore.storeName}</span>
              <span className="text-xs text-stone-400">{topStore.count} {topStore.count === 1 ? 'visita' : 'visitas'}</span>
            </div>
          )}
          {topProduct && (
            <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm flex flex-col gap-1">
              <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">📦 Más comprado</span>
              <span className="font-bold text-stone-800 truncate">{topProduct.name}</span>
              <span className="text-xs text-stone-400">{topProduct.purchases} {topProduct.purchases === 1 ? 'vez' : 'veces'}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Shopping list ──────────────────────────────────────────────────── */}
      <SupermarketView initialItems={items} />
    </div>
  );
}
