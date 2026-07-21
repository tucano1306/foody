'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from '@/components/products/ProductCard';
import ProductsBrowser from '@/components/products/ProductsBrowser';
import SectionHeader from '@/components/layout/SectionHeader';
import Reveal from '@/components/layout/Reveal';

type PurchaseEntry = { purchasedAt: string; storeName: string | null };
type PurchaseRecord = Record<string, PurchaseEntry>;

// Pantry urgency blocks use denser, smaller cards, so a couple more fit before the fold.
const DENSE_INITIAL_VISIBLE = 6;

interface Props {
  readonly initialProducts: readonly Product[];
  readonly lastPurchaseMap?: Readonly<PurchaseRecord>;
  /** Products already grabbed in the store (in cart in Modo Supermercado):
   * hidden from the "faltantes" sections while the trip is in progress. */
  readonly inCartProductIds?: readonly string[];
  /** Signed-in user id — shared household products render read-only. */
  readonly currentUserId?: string;
}

function ProductGrid({
  items,
  onLevelChange,
  lastPurchaseMap,
  dense = false,
  currentUserId,
}: {
  readonly items: readonly Product[];
  readonly onLevelChange: (id: string, level: StockLevel) => void;
  readonly lastPurchaseMap?: Readonly<PurchaseRecord>;
  /** Tighter grid (more columns, smaller cards) — used in the pantry urgency blocks. */
  readonly dense?: boolean;
  readonly currentUserId?: string;
}) {
  if (items.length === 1) {
    return (
      <div className="flex justify-center">
        <div className={dense ? 'w-1/3 sm:w-1/4 md:w-1/5' : 'w-1/2 sm:w-1/3 md:w-1/4'}>
          <ProductCard product={items[0]} onLevelChange={onLevelChange} lastPurchase={lastPurchaseMap?.[items[0].id]} currentUserId={currentUserId} />
        </div>
      </div>
    );
  }
  const cols = dense
    ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
  return (
    <div className={`grid ${cols} ${dense ? 'gap-2.5' : 'gap-4'}`}>
      {items.map((p) => (
        <ProductCard key={p.id} product={p} onLevelChange={onLevelChange} lastPurchase={lastPurchaseMap?.[p.id]} currentUserId={currentUserId} />
      ))}
    </div>
  );
}

/** Tinted card treatment per urgency level so each pantry block reads as its own zone. */
const SECTION_TONES = {
  rose: {
    card: 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40',
    toggle: 'border-rose-200 text-rose-500 hover:bg-rose-100/60 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40',
  },
  amber: {
    card: 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40',
    toggle: 'border-amber-200 text-amber-600 hover:bg-amber-100/60 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40',
  },
} as const;

function CollapsibleSection({
  title,
  tone,
  items,
  onLevelChange,
  lastPurchaseMap,
  currentUserId,
}: {
  readonly title: React.ReactNode;
  readonly tone: keyof typeof SECTION_TONES;
  readonly items: readonly Product[];
  readonly onLevelChange: (id: string, level: StockLevel) => void;
  readonly lastPurchaseMap?: Readonly<PurchaseRecord>;
  readonly currentUserId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, DENSE_INITIAL_VISIBLE);
  const hidden = items.length - DENSE_INITIAL_VISIBLE;

  const plural = hidden === 1 ? '' : 's';
  const toggleLabel = expanded ? '▲ Mostrar menos' : `▼ Ver ${hidden} producto${plural} más`;

  return (
    <section className={`zone-card rounded-2xl border p-4 sm:p-5 shadow-sm ${SECTION_TONES[tone].card}`}>
      <h2 className="text-base sm:text-lg font-bold mb-4 flex items-center justify-center gap-2 text-center">{title}</h2>
      <ProductGrid items={visible} onLevelChange={onLevelChange} lastPurchaseMap={lastPurchaseMap} dense currentUserId={currentUserId} />
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-3 w-full py-2 rounded-xl border border-dashed text-sm transition ${SECTION_TONES[tone].toggle}`}
        >
          {toggleLabel}
        </button>
      )}
    </section>
  );
}

export default function HomeProductsShell({ initialProducts, lastPurchaseMap: initialPurchaseMap, inCartProductIds, currentUserId }: Props) {
  const [products, setProducts] = useState<readonly Product[]>(initialProducts);
  const [lastPurchaseMap, setLastPurchaseMap] = useState<Readonly<PurchaseRecord> | undefined>(initialPurchaseMap);

  // Re-fetch fresh purchase history client-side so it reflects recent completions
  useEffect(() => {
    fetch('/api/shopping-list/last-purchases', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((rows: { productId: string; purchasedAt: string; storeName: string | null }[]) => {
        const record: PurchaseRecord = {};
        for (const r of rows) record[r.productId] = { purchasedAt: r.purchasedAt, storeName: r.storeName };
        setLastPurchaseMap(record);
      })
      .catch(() => undefined);
  }, []);

  function handleLevelChange(id: string, newLevel: StockLevel) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stockLevel: newLevel } : p)),
    );
  }

  // While a shopping trip is in progress, products already in the cart drop
  // out of the "faltantes" sections: what you grab at the súper disappears
  // here at once, so both pages tell the same story.
  const inCart = useMemo(() => new Set(inCartProductIds ?? []), [inCartProductIds]);
  const empty = useMemo(() => products.filter((p) => p.stockLevel === 'empty' && !inCart.has(p.id)), [products, inCart]);
  const low = useMemo(() => products.filter((p) => p.stockLevel === 'half' && !inCart.has(p.id)), [products, inCart]);

  return (
    <>
      {/* ─── Todos los productos (búsqueda + catálogo, primero) ──────────── */}
      <Reveal className="space-y-5">
        <SectionHeader emoji="🛒" title="Productos" tone="green" centered />
        <section className="zone-card bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 p-4 sm:p-5 shadow-sm">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-4">
          <span aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-bold text-stone-700 dark:text-stone-200 truncate text-center">
            🛒 Todos los productos ({products.length})
          </h2>
          <Link
            href="/products/new"
            aria-label="Agregar producto"
            className="justify-self-end shrink-0 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            + Agregar
          </Link>
        </div>
        {products.length === 0 ? (
          <div className="text-center py-16 text-stone-400">
            <p className="text-5xl mb-4">🥑</p>
            <p className="text-lg font-medium">No hay productos todavía</p>
            <Link href="/products/new" className="mt-3 inline-block text-brand-500 hover:underline">
              Agrega tu primer producto
            </Link>
          </div>
        ) : (
          <ProductsBrowser
            products={products}
            pageSize={12}
            searchOnly
            compact
            lastPurchaseMap={lastPurchaseMap}
            onLevelChange={handleLevelChange}
            inCartProductIds={inCartProductIds}
            currentUserId={currentUserId}
          />
        )}
        </section>
      </Reveal>

      {/* ─── Mi despensa (urgencias: agotados → queda poco) ──────────────── */}
      {(empty.length > 0 || low.length > 0) && (
        <Reveal className="space-y-5">
          <SectionHeader emoji="🥑" title="Mi despensa" tone="amber" centered />

          {empty.length > 0 && (
            <CollapsibleSection
              title={<><span className="text-rose-700 dark:text-rose-400">🚨 Se acabó — prioridad</span><span className="ml-1 text-sm font-normal text-rose-400">({empty.length})</span></>}
              tone="rose"
              items={empty}
              onLevelChange={handleLevelChange}
              lastPurchaseMap={lastPurchaseMap}
              currentUserId={currentUserId}
            />
          )}

          {low.length > 0 && (
            <CollapsibleSection
              title={<><span className="text-amber-700 dark:text-amber-400">⚠️ Queda poco</span><span className="ml-1 text-sm font-normal text-amber-400">({low.length})</span></>}
              tone="amber"
              items={low}
              onLevelChange={handleLevelChange}
              lastPurchaseMap={lastPurchaseMap}
              currentUserId={currentUserId}
            />
          )}
        </Reveal>
      )}
    </>
  );
}
