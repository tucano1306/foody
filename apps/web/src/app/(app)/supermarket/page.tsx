import Image from 'next/image';
import { api } from '@/lib/api';
import SupermarketView from '@/components/shopping/SupermarketView';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import { getStoreLogo } from '@/lib/store-logo';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Supermercado' };

function fmt(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function SupermarketPage() {
  const [items, topStores] = await Promise.all([
    api.shoppingList.get().catch(() => []),
    api.shoppingTrips.byStore().catch(() => []),
  ]);

  // Skip the "Sin tienda" bucket: it isn't a real store the user can favor
  // or pick from the suggestions list.
  const namedStores = [...topStores]
    .filter((s) => s.storeName && s.storeName !== 'Sin tienda')
    .sort((a, b) => b.count - a.count);
  const topStore = namedStores[0] ?? null;
  const pastStoreNames = namedStores.map((s) => s.storeName);
  const topStoreLogo = topStore ? getStoreLogo(topStore.storeName) : null;

  return (
    <div className="space-y-6">
      {/* ─── Header (plain title, consistent with other pages) ──────────────── */}
      <ModernTitle
        title="🛒 Modo Supermercado"
        subtitle={`${items.length} producto${items.length === 1 ? '' : 's'} para comprar`}
        action={<ModeToggle currentMode="supermarket" />}
      />

      {/* ─── Quick stats ────────────────────────────────────────────────────── */}
      {topStore && (
        <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800 shadow-sm flex items-center gap-3">
          {topStoreLogo ? (
            <span className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center bg-white border border-stone-100 shrink-0">
              <Image src={topStoreLogo} alt={topStore.storeName} width={44} height={44} className="object-contain w-full h-full" />
            </span>
          ) : (
            <span className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-xl shrink-0" aria-hidden="true">
              🏪
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-stone-400 dark:text-stone-500 font-medium uppercase tracking-wide">
              Tu súper favorito
            </p>
            <p className="font-bold text-stone-800 dark:text-stone-100 truncate">{topStore.storeName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-stone-800 dark:text-stone-100 tabular-nums">
              {topStore.count} {topStore.count === 1 ? 'visita' : 'visitas'}
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500 tabular-nums">{fmt(topStore.total)} gastados</p>
          </div>
        </div>
      )}

      {/* ─── Shopping list ──────────────────────────────────────────────────── */}
      <SupermarketView initialItems={items} pastStoreNames={pastStoreNames} />
    </div>
  );
}
