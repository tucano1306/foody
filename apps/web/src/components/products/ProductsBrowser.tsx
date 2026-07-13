'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from './ProductCard';
import { categoryEmoji, categoryOrder } from '@/lib/categories';

const ProductScanSearch = dynamic(() => import('./ProductScanSearch'), { ssr: false });

type StockFilter = 'all' | 'low' | StockLevel;
type ViewMode = 'grid' | 'categories';

interface Props {
  readonly products: readonly Product[];
  readonly showActions?: boolean;
  readonly compact?: boolean;
  readonly showStockFilter?: boolean;
  readonly pageSize?: number;
  readonly emptyState?: React.ReactNode;
  readonly searchOnly?: boolean;
  readonly lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
  readonly showHealthMeter?: boolean;
}

const FILTERS: ReadonlyArray<{ key: StockFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'low', label: 'Stock bajo' },
  { key: 'half', label: 'Mitad' },
  { key: 'empty', label: 'Sin stock' },
  { key: 'full', label: 'OK' },
];

function healthConfig(pct: number): { emoji: string; label: string; from: string; to: string } {
  if (pct >= 80) return { emoji: '😄', label: '¡Despensa saludable!', from: '#4ade80', to: '#16a34a' };
  if (pct >= 50) return { emoji: '🙂', label: 'Vas bien, ojo con lo que falta', from: '#a7ce39', to: '#739931' };
  if (pct >= 25) return { emoji: '😟', label: 'Varios productos por reponer', from: '#fbbf24', to: '#d97706' };
  return { emoji: '😱', label: '¡Tu despensa pide auxilio!', from: '#f87171', to: '#dc2626' };
}

/** Game-style meter: % of the pantry that's fully stocked. */
function PantryHealthMeter({ products }: { readonly products: readonly Product[] }) {
  const total = products.length;
  const fullCount = products.filter((p) => (p.stockLevel ?? 'full') === 'full').length;
  const emptyCount = products.filter((p) => p.stockLevel === 'empty').length;
  const pct = Math.round((fullCount / total) * 100);
  const cfg = healthConfig(pct);
  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-semibold text-stone-700">
          <motion.span
            key={cfg.emoji}
            initial={{ scale: 0.3, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 12 }}
            className="inline-block mr-1.5 text-base"
          >
            {cfg.emoji}
          </motion.span>
          Salud de tu despensa
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: cfg.to }}>{pct}%</span>
      </div>
      <div className="relative h-3 bg-stone-100 rounded-full">
        <div
          className="progress-fun h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(pct, 3)}%`,
            ['--progress-from' as string]: cfg.from,
            ['--progress-to' as string]: cfg.to,
          }}
        />
      </div>
      <p className="text-[11px] text-stone-400 mt-1.5">
        {cfg.label}
        {emptyCount > 0 && ` · ${emptyCount} agotado${emptyCount === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}

interface GridOptions {
  searchOnly: boolean;
  trimmedQuery: string;
  filtered: readonly Product[];
  emptyState: React.ReactNode;
  visible: readonly Product[];
  showActions: boolean;
  compact: boolean;
  lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  onLevelChange?: (id: string, newLevel: StockLevel) => void;
  onDelete?: (id: string) => void;
}

function ProductGrid({ products, showActions, compact, lastPurchaseMap, onLevelChange, onDelete }: {
  readonly products: readonly Product[];
  readonly showActions: boolean;
  readonly compact: boolean;
  readonly lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
  readonly onDelete?: (id: string) => void;
}) {
  return (
    <div className={`grid gap-2 sm:gap-3 card-stagger ${showActions ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5'}`}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          showActions={showActions}
          compact={compact}
          lastPurchase={lastPurchaseMap?.[product.id]}
          onLevelChange={onLevelChange}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function renderGrid({
  searchOnly,
  trimmedQuery,
  filtered,
  emptyState,
  visible,
  showActions,
  compact,
  lastPurchaseMap,
  onLevelChange,
  onDelete,
}: GridOptions): React.ReactNode {
  if (searchOnly && !trimmedQuery) {
    return (
      <div className="text-center py-10 text-stone-400">
        <p className="text-3xl mb-2">🔍</p>
        <p className="text-sm">Escribe para buscar un producto</p>
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400">
        {emptyState ?? <p>No hay productos que coincidan</p>}
      </div>
    );
  }
  return (
    <ProductGrid products={visible} showActions={showActions} compact={compact} lastPurchaseMap={lastPurchaseMap} onLevelChange={onLevelChange} onDelete={onDelete} />
  );
}

function renderGrouped({
  filtered,
  emptyState,
  showActions,
  compact,
  lastPurchaseMap,
  onLevelChange,
  onDelete,
}: Omit<GridOptions, 'visible' | 'trimmedQuery' | 'searchOnly'>): React.ReactNode {
  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400">
        {emptyState ?? <p>No hay productos que coincidan</p>}
      </div>
    );
  }

  const categoryMap = new Map<string, Product[]>();
  for (const p of filtered) {
    const cat = p.category?.trim() || 'Otro';
    const existing = categoryMap.get(cat) ?? [];
    existing.push(p);
    categoryMap.set(cat, existing);
  }

  const sortedCategories = [...categoryMap.keys()].sort(
    (a, b) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      {sortedCategories.map((cat) => {
        const items = categoryMap.get(cat)!;
        const emoji = categoryEmoji(cat);
        return (
          <section key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{emoji}</span>
              <h3 className="font-semibold text-stone-700 text-base">{cat}</h3>
              <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <ProductGrid products={items} showActions={showActions} compact={compact} lastPurchaseMap={lastPurchaseMap} onLevelChange={onLevelChange} onDelete={onDelete} />
          </section>
        );
      })}
    </div>
  );
}

export default function ProductsBrowser(props: Readonly<Props>) {
  const {
    products: initialProducts,
    showActions = false,
    compact = false,
    showStockFilter = false,
    pageSize = 12,
    emptyState,
    searchOnly = false,
    lastPurchaseMap,
    onLevelChange,
    showHealthMeter = false,
  } = props;

  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get('filter') ?? 'all') as StockFilter;

  const [localProducts, setLocalProducts] = useState<readonly Product[]>(initialProducts);
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialFilter);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [scanOpen, setScanOpen] = useState(false);

  // Sync whenever the server sends fresh data (after router.refresh())
  useEffect(() => {
    setLocalProducts(initialProducts);
  }, [initialProducts]);

  const handleDelete = (id: string) => {
    setLocalProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLevelChange = useCallback((id: string, newLevel: StockLevel) => {
    setLocalProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stockLevel: newLevel } : p)),
    );
    onLevelChange?.(id, newLevel);
  }, [onLevelChange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localProducts.filter((p) => {
      if (stockFilter === 'low' && p.stockLevel === 'full') return false;
      if (stockFilter !== 'all' && stockFilter !== 'low' && p.stockLevel !== stockFilter) return false;
      if (!q) return true;
      const hay = `${p.name} ${p.category ?? ''} ${p.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [localProducts, query, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const onFilterChange = (key: StockFilter) => {
    setStockFilter(key);
    setPage(1);
  };

  // Camera search found a product: clear filters that could hide it and let
  // the existing name filter surface its card.
  const onScanSelect = (product: Product) => {
    setScanOpen(false);
    setStockFilter('all');
    setQuery(product.name);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {scanOpen && (
        <ProductScanSearch
          products={localProducts}
          onSelect={onScanSelect}
          onClose={() => setScanOpen(false)}
        />
      )}

      {/* Pantry health meter (game-style) */}
      {showHealthMeter && localProducts.length > 0 && (
        <PantryHealthMeter products={localProducts} />
      )}

      {/* Search + view toggle */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <motion.span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            whileHover={{ scale: 1.3, rotate: -15 }}
            animate={
              query
                ? { scale: [1, 1.2, 1], rotate: [0, -10, 0], x: 0 }
                : { x: [0, 5, -5, 5, 0], rotate: [0, -8, 8, -8, 0] }
            }
            transition={
              query
                ? { type: 'spring', stiffness: 400, damping: 15 }
                : { duration: 2.4, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }
            }
          >
            🔍
          </motion.span>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar productos…"
            className="w-full pl-10 pr-10 py-2.5 bg-white border border-stone-200 rounded-xl text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Camera search: scan a barcode or photograph the label */}
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          aria-label="Buscar producto con la cámara"
          title="Buscar producto con la cámara"
          className="px-3 py-2.5 rounded-xl border border-stone-200 bg-white text-base text-stone-500 hover:bg-stone-50 shrink-0 transition"
        >
          📷
        </button>

        {/* View mode toggle */}
        {!searchOnly && (
          <div className="flex rounded-xl border border-stone-200 overflow-hidden bg-white shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Vista cuadrícula"
              className={`px-3 py-2.5 text-base transition ${viewMode === 'grid' ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
            >
              ⊞
            </button>
            <button
              type="button"
              onClick={() => setViewMode('categories')}
              aria-label="Vista por categorías"
              className={`px-3 py-2.5 text-base transition ${viewMode === 'categories' ? 'bg-brand-500 text-white' : 'text-stone-500 hover:bg-stone-50'}`}
            >
              📂
            </button>
          </div>
        )}
      </div>

      {/* Stock filter chips */}
      {showStockFilter && (
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => {
            const active = stockFilter === f.key;
            return (
              <motion.button
                key={f.key}
                type="button"
                onClick={() => onFilterChange(f.key)}
                whileHover={{ scale: 1.07 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className={`px-3 py-1 rounded-full text-sm border transition ${
                  active
                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                }`}
              >
                {f.label}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Results meta — only in grid mode */}
      {viewMode === 'grid' && (!searchOnly || query.trim()) && (
        <p className="text-xs text-stone-500">
          {filtered.length === 0
            ? 'Sin resultados'
            : `Mostrando ${start + 1}–${Math.min(start + pageSize, filtered.length)} de ${filtered.length}`}
        </p>
      )}

      {/* Grid or Grouped */}
      {viewMode === 'categories' && !searchOnly
        ? renderGrouped({ filtered, emptyState, showActions, compact, lastPurchaseMap, onLevelChange: handleLevelChange, onDelete: handleDelete })
        : renderGrid({ searchOnly, trimmedQuery: query.trim(), filtered, emptyState, visible, showActions, compact, lastPurchaseMap, onLevelChange: handleLevelChange, onDelete: handleDelete })}

      {/* Pagination — only in grid mode */}
      {viewMode === 'grid' && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-100 transition"
          >
            ← Anterior
          </button>
          <span className="text-sm text-stone-500">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-100 transition"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
