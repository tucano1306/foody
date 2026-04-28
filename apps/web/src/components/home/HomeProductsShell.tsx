'use client';

import { useState, useMemo } from 'react';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from '@/components/products/ProductCard';
import ProductsBrowser from '@/components/products/ProductsBrowser';

interface Props {
  readonly initialProducts: readonly Product[];
  readonly lastPurchaseMap?: ReadonlyMap<string, { purchasedAt: string; storeName: string | null }>;
}

function ProductGrid({
  items,
  onLevelChange,
}: {
  readonly items: readonly Product[];
  readonly onLevelChange: (id: string, level: StockLevel) => void;
}) {
  if (items.length === 1) {
    return (
      <div className="flex justify-center">
        <div className="w-1/2 sm:w-1/3 md:w-1/4">
          <ProductCard product={items[0]} onLevelChange={onLevelChange} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} onLevelChange={onLevelChange} />
      ))}
    </div>
  );
}

export default function HomeProductsShell({ initialProducts, lastPurchaseMap }: Props) {
  const [products, setProducts] = useState<readonly Product[]>(initialProducts);

  function handleLevelChange(id: string, newLevel: StockLevel) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stockLevel: newLevel } : p)),
    );
  }

  const empty = useMemo(() => products.filter((p) => p.stockLevel === 'empty'), [products]);
  const low = useMemo(() => products.filter((p) => p.stockLevel === 'half'), [products]);

  return (
    <>
      {empty.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-rose-700 mb-4 flex items-center gap-2">
            <span>🚨</span> Se acabó — prioridad ({empty.length})
          </h2>
          <ProductGrid items={empty} onLevelChange={handleLevelChange} />
        </section>
      )}

      {low.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-amber-700 mb-4 flex items-center gap-2">
            <span>⚠️</span> Queda poco ({low.length})
          </h2>
          <ProductGrid items={low} onLevelChange={handleLevelChange} />
        </section>
      )}

      {/* ─── Todos los productos ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="flex-1 text-base sm:text-xl font-semibold text-stone-700 truncate">
            🛒 Todos los productos ({products.length})
          </h2>
          <a
            href="/products/new"
            aria-label="Agregar producto"
            className="shrink-0 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            + Agregar
          </a>
        </div>
        {products.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <p className="text-5xl mb-4">🥑</p>
            <p className="text-lg font-medium">No hay productos todavía</p>
            <a href="/products/new" className="mt-3 inline-block text-brand-500 hover:underline">
              Agrega tu primer producto
            </a>
          </div>
        ) : (
          <ProductsBrowser
            products={products}
            pageSize={12}
            searchOnly
            lastPurchaseMap={lastPurchaseMap}
            onLevelChange={handleLevelChange}
          />
        )}
      </section>
    </>
  );
}
