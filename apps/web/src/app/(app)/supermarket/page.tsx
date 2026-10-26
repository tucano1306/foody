import { api } from '@/lib/api';
import SupermarketView from '@/components/shopping/SupermarketView';
import UltimaCompra from '@/components/shopping/UltimaCompra';
import ModeToggle from '@/components/layout/ModeToggle';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Supermercado' };

export default async function SupermarketPage() {
  const [items, topStores, catalogo, apartados, ultima] = await Promise.all([
    api.shoppingList.get().catch(() => []),
    // Ya no pinta «el súper favorito»: solo da las sugerencias de tienda del
    // modal de finalizar, ordenadas por visitas.
    api.shoppingTrips.byStore().catch(() => []),
    // Las categorías de TODA la despensa, no solo las de lo pendiente: el
    // desplegable listaba las de los 7 productos por comprar y, al lado de
    // Productos, parecía que le faltaban.
    api.products.listWithoutPhotos().catch(() => []),
    // Lo que «no estaba en el súper» hoy: se nombra al pie de la lista.
    api.shoppingList.skipped().catch(() => [] as Array<{ productId: string; name: string }>),
    api.shoppingTrips.latest().catch(() => null),
  ]);
  const allCategories = [
    ...new Set(catalogo.map((p) => p.category?.trim()).filter((c): c is string => !!c)),
  ];

  // Skip the "Sin tienda" bucket: it isn't a real store the user can favor
  // or pick from the suggestions list.
  const namedStores = [...topStores]
    .filter((s) => s.storeName && s.storeName !== 'Sin tienda')
    .sort((a, b) => b.count - a.count);
  const pastStoreNames = namedStores.map((s) => s.storeName);

  return (
    <div className="space-y-6">
      {/* ─── Header (plain title, consistent with other pages) ──────────────── */}
      <ModernTitle
        title="Modo Supermercado"
        subtitle={`${items.length} producto${items.length === 1 ? '' : 's'} para comprar`}
        action={<ModeToggle currentMode="supermarket" />}
      />

      {/* ─── La última compra ─────────────────────────────────────────────────
          Aquí iba el súper con más visitas y lo gastado en él desde siempre:
          una estadística, que ya vive en Estadísticas. Al entrar a comprar
          sirve más lo de la última vez, y de un toque, su ticket. */}
      {ultima && <UltimaCompra trip={ultima.trip} items={ultima.items} />}

      {/* ─── Shopping list ──────────────────────────────────────────────────── */}
      <SupermarketView allCategories={allCategories} initialItems={items} initialApartados={apartados} pastStoreNames={pastStoreNames} />
    </div>
  );
}
