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
  const [items, topStores, catalogo] = await Promise.all([
    api.shoppingList.get().catch(() => []),
    api.shoppingTrips.byStore().catch(() => []),
    // Las categorías de TODA la despensa, no solo las de lo pendiente: el
    // desplegable listaba las de los 7 productos por comprar y, al lado de
    // Productos, parecía que le faltaban.
    api.products.listWithoutPhotos().catch(() => []),
  ]);
  const allCategories = [
    ...new Set(catalogo.map((p) => p.category?.trim()).filter((c): c is string => !!c)),
  ];

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
        title="Modo Supermercado"
        subtitle={`${items.length} producto${items.length === 1 ? '' : 's'} para comprar`}
        action={<ModeToggle currentMode="supermarket" />}
      />

      {/* ─── Quick stats ────────────────────────────────────────────────────── */}
      {topStore && (
        <div className="card flex items-center gap-3 p-3.5">
          {topStoreLogo ? (
            <span className="w-12 h-12 rounded-2xl overflow-hidden grid place-items-center bg-white border border-[var(--line)] shrink-0">
              <Image src={topStoreLogo} alt="" width={48} height={48} className="object-contain w-full h-full" />
            </span>
          ) : (
            <span className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] grid place-items-center text-xl shrink-0" aria-hidden="true">
              🏪
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[var(--ink)] truncate">{topStore.storeName}</p>
            {/* Antes: «Tu súper favorito» en micro-mayúsculas ENCIMA del nombre.
                Una etiqueta que ocupaba más que el dato y que no hacía falta —
                si es el único que sale aquí, ya se entiende cuál es. */}
            <p className="t-meta truncate">
              {topStore.count} {topStore.count === 1 ? 'visita' : 'visitas'} · {fmt(topStore.total)}
            </p>
          </div>
        </div>
      )}

      {/* ─── Shopping list ──────────────────────────────────────────────────── */}
      <SupermarketView allCategories={allCategories} initialItems={items} pastStoreNames={pastStoreNames} />
    </div>
  );
}
