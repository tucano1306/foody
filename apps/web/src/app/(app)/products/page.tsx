import { api } from '@/lib/api';
import ProductsBrowser from '@/components/products/ProductsBrowser';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mis Productos' };

export default async function ProductsPage() {
  const products = await api.products.list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">🥗 Mis Productos</h1>
          <p className="text-stone-500 mt-1">{products.length} productos en tu despensa</p>
        </div>
        <a
          href="/products/new"
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          + Agregar producto
        </a>
      </div>

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
        <ProductsBrowser products={products} showActions showStockFilter pageSize={12} />
      )}
    </div>
  );
}
