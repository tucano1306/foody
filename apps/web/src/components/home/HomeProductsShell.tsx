'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import type { Product, StockLevel } from '@foody/types';
import ProductCard from '@/components/products/ProductCard';
import ProductsBrowser from '@/components/products/ProductsBrowser';
import { ChevronDownIcon, PlusIcon } from '@heroicons/react/24/solid';
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

/**
 * Las dos zonas de urgencia de la despensa.
 *
 * Comparten gama azul, así que se separan por PESO, no por matiz: lo que se
 * acabó va sobre el tinte de marca y con una barra de acento sólida; lo que
 * queda a la mitad reposa en la superficie normal. Así, al bajar por la
 * pantalla, el bloque urgente es el único que empuja.
 */
const SECTION_TONES = {
  urgent: {
    card: 'bg-[var(--accent-soft)] border-brand-200 dark:border-brand-800/60',
    bar: 'bg-[var(--accent)]',
  },
  warning: {
    card: 'bg-[var(--surface)] border-[var(--line)]',
    bar: 'bg-brand-300',
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

  return (
    <section
      className={`zone-card rounded-[var(--radius-card)] border p-4 sm:p-5 shadow-[var(--shadow-sm)] ${SECTION_TONES[tone].card}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <span aria-hidden="true" className={`w-1 self-stretch min-h-6 rounded-full shrink-0 ${SECTION_TONES[tone].bar}`} />
        <h2 className="text-base sm:text-lg font-extrabold text-[var(--ink)] min-w-0">{title}</h2>
      </div>
      <ProductGrid items={visible} onLevelChange={onLevelChange} lastPurchaseMap={lastPurchaseMap} dense currentUserId={currentUserId} />
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-[var(--surface-2)] text-sm font-semibold text-[var(--ink-muted)]"
        >
          {/* La flecha ERA texto («▲ Mostrar menos»): un carácter que cambia de
              forma según la fuente del sistema y que no gira. Ahora es un icono
              que rota, y el botón dice una cosa sola. */}
          {expanded ? 'Mostrar menos' : `Ver ${hidden} más`}
          <ChevronDownIcon
            aria-hidden="true"
            className={`w-4 h-4 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
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
      {/* ─── Todos los productos (búsqueda + catálogo, primero) ──────────────
          Antes había DOS cabeceras seguidas para esta misma zona: una píldora
          «Productos · Busca en tu despensa o explora por categoría» y, dentro
          de la tarjeta, «🛒 Todos los productos (N)». Dos títulos y una
          instrucción para una lista con su propio buscador a la vista. Queda
          uno. */}
      <Reveal className="space-y-5">
        <section className="zone-card bg-[var(--surface)] rounded-[var(--radius-card)] border border-[var(--line)] p-4 sm:p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="flex items-baseline gap-2 min-w-0 text-lg sm:text-xl font-extrabold text-[var(--ink)]">
            <span className="truncate">Productos</span>
            <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--ink-muted)]">
              {products.length}
            </span>
          </h2>
          <Link
            href="/products/new"
            aria-label="Agregar producto"
            /* Círculo con un «+» en móvil, y texto completo cuando hay
                sitio. Con el botón entero de texto, a 375 px se comía un
                tercio de la fila y pesaba más que el propio título. */
            className="shrink-0 btn-primary grid place-items-center w-11 h-11 sm:w-auto sm:h-auto rounded-full sm:rounded-xl sm:px-4 sm:py-2 text-sm whitespace-nowrap touch-auto-size"
          >
            <PlusIcon className="w-5 h-5 sm:hidden" />
            <span className="hidden sm:inline">Agregar</span>
          </Link>
        </div>
        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4 opacity-40">🥑</p>
            <p className="text-lg font-semibold text-[var(--ink)]">Tu despensa está vacía</p>
            <Link href="/products/new" className="btn-primary mt-5 inline-flex items-center rounded-2xl px-5 py-3 text-sm">
              Agregar el primero
            </Link>
          </div>
        ) : (
          <ProductsBrowser
            products={products}
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
          <SectionHeader title="Hay que reponer" tone="brand" />

          {empty.length > 0 && (
            <CollapsibleSection
              title={<>Se acabó <span className="text-[var(--accent)]">({empty.length})</span></>}
              tone="urgent"
              items={empty}
              onLevelChange={handleLevelChange}
              lastPurchaseMap={lastPurchaseMap}
              currentUserId={currentUserId}
            />
          )}

          {low.length > 0 && (
            <CollapsibleSection
              title={<>Queda poco <span className="text-[var(--ink-subtle)]">({low.length})</span></>}
              tone="warning"
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
