import { api } from '@/lib/api';
import ProductsBrowser from '@/components/products/ProductsBrowser';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mis Productos' };

export default async function ProductsPage() {
  const [products, lastPurchasesRaw] = await Promise.all([
    api.products.list().catch(() => [] as Awaited<ReturnType<typeof api.products.list>>),
    api.shoppingList.lastPurchases().catch(() => [] as { productId: string; purchasedAt: string; storeName: string | null }[]),
  ]);

  const lastPurchaseMap = Object.fromEntries(
    lastPurchasesRaw.map((p) => [p.productId, { purchasedAt: p.purchasedAt, storeName: p.storeName }]),
  );

  return (
    <div className="space-y-6">
      <ModernTitle
        title="🥗 Mis Productos"
        subtitle={`${products.length} productos en tu despensa`}
        action={
          <a
            href="/products/new"
            aria-label="Agregar producto"
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl transition-colors shadow-sm text-xs sm:text-sm whitespace-nowrap"
          >
            <span className="sm:hidden">+ Nuevo</span>
            <span className="hidden sm:inline">+ Agregar producto</span>
          </a>
        }
      />

      {/* ─── Filter badges ──────────────────────────────────────────────────── */}
      {products.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-6xl mb-4">🛒</p>
          <h2 className="text-xl font-semibold text-stone-600 mb-2">
            Tu despensa está vacía
          </h2>
          <p className="text-stone-400 mb-6">
            Agrega productos para empezar a gestionar tu inventario
          </p>
          <a
            href="/products/new"
            className="bg-brand-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-600 transition"
          >
            Agregar primer producto
          </a>
        </div>
      ) : (
        <ProductsBrowser products={products} showActions showStockFilter pageSize={12} lastPurchaseMap={lastPurchaseMap} />
      )}
    </div>
  );
}
