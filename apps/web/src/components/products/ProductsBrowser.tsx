'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from './ProductCard';

type StockFilter = 'all' | StockLevel;
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
}

const FILTERS: ReadonlyArray<{ key: StockFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'half', label: 'Bajo stock' },
  { key: 'empty', label: 'Sin stock' },
  { key: 'full', label: 'OK' },
];

const CATEGORY_EMOJI: Record<string, string> = {
  'frutas y verduras': '🥦', 'frutas': '🍎', 'verduras': '🥦',
  'lácteos': '🥛', 'lacteos': '🥛',
  'carnicería': '🥩', 'carniceria': '🥩', 'carnes': '🥩',
  'pescadería': '🐟', 'pescaderia': '🐟',
  'panadería y tortillería': '🍞', 'panaderia y tortilleria': '🍞',
  'panadería': '🍞', 'panaderia': '🍞',
  'granos y legumbres': '🌾',
  'cereales y desayunos': '🥣', 'cereales': '🌾',
  'enlatados': '🥫', 'congelados': '🧊',
  'snacks y dulces': '🍬', 'snacks': '🍿',
  'condimentos y salsas': '🧂',
  'bebidas': '🥤', 'limpieza': '🧹',
  'higiene y cuidado': '🧴', 'higiene': '🧴',
  'mascotas': '🐾', 'otro': '📦',
};

const CATEGORY_ORDER: Record<string, number> = {
  'frutas y verduras': 1, 'frutas': 2, 'verduras': 3,
  'lácteos': 4, 'lacteos': 4,
  'carnicería': 5, 'carniceria': 5, 'carnes': 6,
  'pescadería': 7, 'pescaderia': 7,
  'panadería y tortillería': 8, 'panaderia y tortilleria': 8,
  'panadería': 9, 'panaderia': 9,
  'granos y legumbres': 10,
  'cereales y desayunos': 11, 'cereales': 12,
  'enlatados': 13, 'congelados': 14,
  'snacks y dulces': 15, 'snacks': 16,
  'condimentos y salsas': 17,
  'bebidas': 18, 'limpieza': 19,
  'higiene y cuidado': 20, 'higiene': 20,
  'mascotas': 21, 'otro': 99,
};

function getCategoryEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat.toLowerCase()] ?? '📦';
}

function getCategoryOrder(cat: string): number {
  return CATEGORY_ORDER[cat.toLowerCase()] ?? 98;
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
}

function ProductGrid({ products, showActions, compact, lastPurchaseMap, onLevelChange }: {
  readonly products: readonly Product[];
  readonly showActions: boolean;
  readonly compact: boolean;
  readonly lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
}) {
  return (
    <div className={`grid gap-2 sm:gap-3 ${showActions ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5'}`}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          showActions={showActions}
          compact={compact}
          lastPurchase={lastPurchaseMap?.[product.id]}
          onLevelChange={onLevelChange}
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
    <ProductGrid products={visible} showActions={showActions} compact={compact} lastPurchaseMap={lastPurchaseMap} onLevelChange={onLevelChange} />
  );
}

function renderGrouped({
  filtered,
  emptyState,
  showActions,
  compact,
  lastPurchaseMap,
  onLevelChange,
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
    (a, b) => getCategoryOrder(a) - getCategoryOrder(b) || a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      {sortedCategories.map((cat) => {
        const items = categoryMap.get(cat)!;
        const emoji = getCategoryEmoji(cat);
        return (
          <section key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{emoji}</span>
              <h3 className="font-semibold text-stone-700 text-base">{cat}</h3>
              <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <ProductGrid products={items} showActions={showActions} compact={compact} lastPurchaseMap={lastPurchaseMap} onLevelChange={onLevelChange} />
          </section>
        );
      })}
    </div>
  );
}

export default function ProductsBrowser(props: Readonly<Props>) {
  const {
    products,
    showActions = false,
    compact = false,
    showStockFilter = false,
    pageSize = 12,
    emptyState,
    searchOnly = false,
    lastPurchaseMap,
    onLevelChange,
  } = props;

  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('categories');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter !== 'all' && p.stockLevel !== stockFilter) return false;
      if (!q) return true;
      const hay = `${p.name} ${p.category ?? ''} ${p.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, stockFilter]);

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

  return (
    <div className="space-y-4">
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
              <button
                key={f.key}
                type="button"
                onClick={() => onFilterChange(f.key)}
                className={`px-3 py-1 rounded-full text-sm border transition ${
                  active
                    ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                    : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
                }`}
              >
                {f.label}
              </button>
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
        ? renderGrouped({ filtered, emptyState, showActions, compact, lastPurchaseMap, onLevelChange })
        : renderGrid({ searchOnly, trimmedQuery: query.trim(), filtered, emptyState, visible, showActions, compact, lastPurchaseMap, onLevelChange })}

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
