'use client';

import { useMemo, useState } from 'react';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from './ProductCard';

type StockFilter = 'all' | StockLevel;

interface Props {
  readonly products: readonly Product[];
  readonly showActions?: boolean;
  readonly showStockFilter?: boolean;
  readonly pageSize?: number;
  readonly emptyState?: React.ReactNode;
}

const FILTERS: ReadonlyArray<{ key: StockFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'half', label: 'Bajo stock' },
  { key: 'empty', label: 'Sin stock' },
  { key: 'full', label: 'OK' },
];

export default function ProductsBrowser(props: Readonly<Props>) {
  const {
    products,
    showActions = false,
    showStockFilter = false,
    pageSize = 12,
    emptyState,
  } = props;

  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [page, setPage] = useState(1);

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
      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">🔍</span>
        <input
          type="search"
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

      {/* Results meta */}
      <p className="text-xs text-stone-500">
        {filtered.length === 0
          ? 'Sin resultados'
          : `Mostrando ${start + 1}–${Math.min(start + pageSize, filtered.length)} de ${filtered.length}`}
      </p>

      {/* Grid / empty */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          {emptyState ?? <p>No hay productos que coincidan</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} showActions={showActions} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
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
