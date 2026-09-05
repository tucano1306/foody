'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from './ProductCard';
import CategorySelect from '@/components/ui/CategorySelect';
import { categoryEmoji, categoryOrder } from '@/lib/categories';
import { matchesWords, searchWords } from '@/lib/text-search';

const ALL_CATEGORIES = '__all__';

const ProductScanSearch = dynamic(() => import('./ProductScanSearch'), { ssr: false });

type StockFilter = 'all' | 'low' | StockLevel;
type ViewMode = 'grid' | 'categories';

interface Props {
  readonly products: readonly Product[];
  readonly showActions?: boolean;
  readonly compact?: boolean;
  readonly showStockFilter?: boolean;
  readonly emptyState?: React.ReactNode;
  readonly searchOnly?: boolean;
  readonly lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
  readonly showHealthMeter?: boolean;
  /** Products already grabbed in Modo Supermercado (in cart). Shown as OK
   * while the trip is in progress so Casa, Súper y Productos tell the same
   * story; the real stock update lands when the purchase is finalized. */
  readonly inCartProductIds?: readonly string[];
  /** Signed-in user id — lets each card tell my products from a household
   * member's shared ones (shared items render read-only). */
  readonly currentUserId?: string;
}

const FILTERS: ReadonlyArray<{ key: StockFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'low', label: 'Stock bajo' },
  { key: 'half', label: 'Mitad' },
  { key: 'empty', label: 'Sin stock' },
  { key: 'full', label: 'OK' },
];

function healthConfig(pct: number): { emoji: string; label: string; from: string; to: string } {
  if (pct >= 80) return { emoji: '😄', label: '¡Despensa saludable!', from: '#38bdf8', to: '#0284c7' };
  if (pct >= 50) return { emoji: '🙂', label: 'Vas bien, ojo con lo que falta', from: '#0ea5e9', to: '#0284c7' };
  if (pct >= 25) return { emoji: '😟', label: 'Varios productos por reponer', from: '#60a5fa', to: '#2563eb' };
  return { emoji: '😱', label: '¡Tu despensa pide auxilio!', from: '#60a5fa', to: '#1e40af' };
}

/** Game-style meter: % of the pantry that's fully stocked. */
function PantryHealthMeter({ products }: { readonly products: readonly Product[] }) {
  const total = products.length;
  const fullCount = products.filter((p) => (p.stockLevel ?? 'full') === 'full').length;
  const emptyCount = products.filter((p) => p.stockLevel === 'empty').length;
  const pct = Math.round((fullCount / total) * 100);
  const cfg = healthConfig(pct);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-semibold text-slate-700">
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
      <div className="relative h-3 bg-slate-100 rounded-full">
        <div
          className="progress-fun h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(pct, 3)}%`,
            ['--progress-from' as string]: cfg.from,
            ['--progress-to' as string]: cfg.to,
          }}
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        {cfg.label}
        {emptyCount > 0 && ` · ${emptyCount} agotado${emptyCount === 1 ? '' : 's'}`}
      </p>
    </div>
  );
}

interface GridOptions {
  searchOnly: boolean;
  trimmedQuery: string;
  categoryActive: boolean;
  filtered: readonly Product[];
  emptyState: React.ReactNode;
  visible: readonly Product[];
  showActions: boolean;
  compact: boolean;
  lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  onLevelChange?: (id: string, newLevel: StockLevel) => void;
  onDelete?: (id: string) => void;
  currentUserId?: string;
}

function ProductGrid({ products, showActions, compact, lastPurchaseMap, onLevelChange, onDelete, currentUserId }: {
  readonly products: readonly Product[];
  readonly showActions: boolean;
  readonly compact: boolean;
  readonly lastPurchaseMap?: Readonly<Record<string, { purchasedAt: string; storeName: string | null }>>;
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
  readonly onDelete?: (id: string) => void;
  readonly currentUserId?: string;
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
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}

function renderGrid({
  searchOnly,
  trimmedQuery,
  categoryActive,
  filtered,
  emptyState,
  visible,
  showActions,
  compact,
  lastPurchaseMap,
  onLevelChange,
  onDelete,
  currentUserId,
}: GridOptions): React.ReactNode {
  // Search-only mode idles empty on purpose: the search box and the category
  // chips are the whole UI until you ask for something. A placeholder block
  // here would just be dead space above the pantry sections.
  if (searchOnly && !trimmedQuery && !categoryActive) return null;

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        {emptyState ?? (
          <>
            <p className="text-3xl mb-2">🤷</p>
            <p className="text-sm">No hay productos que coincidan</p>
          </>
        )}
      </div>
    );
  }
  return (
    <ProductGrid products={visible} showActions={showActions} compact={compact} lastPurchaseMap={lastPurchaseMap} onLevelChange={onLevelChange} onDelete={onDelete} currentUserId={currentUserId} />
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
  currentUserId,
}: Omit<GridOptions, 'visible' | 'trimmedQuery' | 'searchOnly' | 'categoryActive'>): React.ReactNode {
  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
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
              <h3 className="font-semibold text-slate-700 text-base">{cat}</h3>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <ProductGrid products={items} showActions={showActions} compact={compact} lastPurchaseMap={lastPurchaseMap} onLevelChange={onLevelChange} onDelete={onDelete} currentUserId={currentUserId} />
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
    emptyState,
    searchOnly = false,
    lastPurchaseMap,
    onLevelChange,
    showHealthMeter = false,
    inCartProductIds,
    currentUserId,
  } = props;

  const searchParams = useSearchParams();
  const initialFilter = (searchParams.get('filter') ?? 'all') as StockFilter;

  const [localProducts, setLocalProducts] = useState<readonly Product[]>(initialProducts);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialFilter);
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

  // Display overlay: an in-cart product reads as OK across the whole browser
  // (filters, counts, health meter) while the shopping trip is in progress.
  const inCart = useMemo(() => new Set(inCartProductIds ?? []), [inCartProductIds]);
  const displayProducts = useMemo(
    () => (inCart.size === 0
      ? localProducts
      : localProducts.map((p) => (inCart.has(p.id) && p.stockLevel !== 'full'
        ? { ...p, stockLevel: 'full' as StockLevel }
        : p))),
    [localProducts, inCart],
  );

  // Every category present in the pantry, in aisle order, with how many
  // products each holds — powers the chip row.
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of displayProducts) {
      const cat = p.category?.trim() || 'Otro';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [displayProducts]);

  const availableCategories = useMemo(
    () => [...categoryCounts.keys()].sort((a, b) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b)),
    [categoryCounts],
  );

  const filtered = useMemo(() => {
    // Por palabras sueltas y sin acentos: nadie recuerda que guardó la crema
    // dental como «Hello Crema Dental», solo que es crema dental. Ver
    // text-search.ts.
    const words = searchWords(query);
    return displayProducts.filter((p) => {
      if (stockFilter === 'low' && p.stockLevel === 'full') return false;
      if (stockFilter !== 'all' && stockFilter !== 'low' && p.stockLevel !== stockFilter) return false;
      if (categoryFilter !== ALL_CATEGORIES && (p.category?.trim() || 'Otro') !== categoryFilter) return false;
      if (words.length === 0) return true;
      return matchesWords(`${p.name} ${p.category ?? ''} ${p.description ?? ''}`, words);
    });
  }, [displayProducts, query, stockFilter, categoryFilter]);

  const trimmedQuery = query.trim();
  const categoryActive = categoryFilter !== ALL_CATEGORIES;
  const anyFilterActive = Boolean(trimmedQuery) || categoryActive;
  // `searchOnly` siempre pinta la rejilla plana: ahi no se ofrece el conmutador
  // de vista, asi que la linea de resultados tiene que seguir a la REJILLA y no
  // a un `viewMode` que en esa pantalla no se puede cambiar.
  const gridMode = searchOnly || viewMode === 'grid';

  /**
   * Se enseña TODO lo filtrado, sin paginar.
   *
   * El pager partia los resultados de doce en doce y, en Casa, se pintaba
   * incluso cuando la rejilla estaba oculta: «Pagina 1 de 8» debajo de una
   * lista vacia, paginando algo que no se veia. La vista por categorias nunca
   * pagino, asi que ademas las dos vistas de la misma pantalla contaban cosas
   * distintas.
   */
  const visible = filtered;

  const onQueryChange = (value: string) => {
    setQuery(value);
  };

  const onFilterChange = (key: StockFilter) => {
    setStockFilter(key);
  };

  const onCategoryChange = (value: string) => {
    setCategoryFilter(value);
  };

  // Camera search found a product: clear filters that could hide it and let
  // the existing name filter surface its card.
  const onScanSelect = (product: Product) => {
    setScanOpen(false);
    setStockFilter('all');
    setQuery(product.name);
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
      {showHealthMeter && displayProducts.length > 0 && (
        <PantryHealthMeter products={displayProducts} />
      )}

      {/* Search + view toggle. The camera lives inside the field so the row
          stays a single search affordance instead of three boxes. */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <motion.span
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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
            className={`w-full pl-11 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition ${query ? 'pr-20' : 'pr-14'}`}
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="w-8 h-8 grid place-items-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
            {/* Camera search: photograph the product to find it in the pantry */}
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              aria-label="Buscar producto con la cámara"
              title="Buscar producto con la cámara"
              className="w-9 h-9 grid place-items-center rounded-full text-base text-slate-500 hover:bg-slate-100 active:scale-95 transition"
            >
              📷
            </button>
          </div>
        </div>

        {/* View mode toggle */}
        {!searchOnly && (
          <div className="flex rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Vista cuadrícula"
              className={`px-3 py-3 text-base transition ${viewMode === 'grid' ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              ⊞
            </button>
            <button
              type="button"
              onClick={() => setViewMode('categories')}
              aria-label="Vista por categorías"
              className={`px-3 py-3 text-base transition ${viewMode === 'categories' ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              📂
            </button>
          </div>
        )}
      </div>

      {/* Elegir pasillo. Era una fila de chips que se desplazaba en horizontal:
          con 17 categorías solo se veían cinco y el resto quedaba fuera de
          pantalla, así que «todas» y «las cinco primeras» se veían igual. */}
      {availableCategories.length > 1 && (
        <CategorySelect
          categories={availableCategories}
          counts={categoryCounts}
          total={displayProducts.length}
          value={categoryFilter === ALL_CATEGORIES ? null : categoryFilter}
          onChange={(cat) => onCategoryChange(cat ?? ALL_CATEGORIES)}
        />
      )}

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
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Results meta + escape hatch — only when a flat grid is on screen */}
      {gridMode && (!searchOnly || anyFilterActive) && (
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <p className="truncate">
            {filtered.length === 0
              ? 'Sin resultados'
              : `${filtered.length} producto${filtered.length === 1 ? '' : 's'}`}
          </p>
          {anyFilterActive && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryFilter(ALL_CATEGORIES);
              }}
              className="shrink-0 font-semibold text-brand-500 hover:text-brand-600 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid or Grouped */}
      {!gridMode
        ? renderGrouped({ filtered, emptyState, showActions, compact, lastPurchaseMap, onLevelChange: handleLevelChange, onDelete: handleDelete, currentUserId })
        : renderGrid({ searchOnly, trimmedQuery, categoryActive, filtered, emptyState, visible, showActions, compact, lastPurchaseMap, onLevelChange: handleLevelChange, onDelete: handleDelete, currentUserId })}

    </div>
  );
}
