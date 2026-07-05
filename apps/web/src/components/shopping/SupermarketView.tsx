'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import type { ShoppingListItem } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstFromElement, confettiRain } from '@/lib/fx';
import { useToast } from '@/components/ui/Toast';
import { CATEGORY_ORDER, categoryEmoji } from '@/lib/categories';

const PriceScannerModal = dynamic(() => import('./PriceScannerModal'), { ssr: false });

interface Props {
  readonly initialItems: ShoppingListItem[];
  readonly pastStoreNames?: readonly string[];
}

type Filter = 'all' | 'urgent' | 'low';

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function getRowCls(inCart: boolean, urgent: boolean): string {
  if (inCart) return 'bg-market-50/60 border-market-200 dark:bg-market-900/20 dark:border-market-800';
  if (urgent) return 'bg-white border-rose-200 hover:border-rose-300 hover:bg-rose-50/40 dark:bg-stone-900 dark:border-rose-900/50 dark:hover:bg-rose-950/30';
  return 'bg-white border-stone-100 hover:border-market-300 hover:bg-market-50/40 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800/60';
}

function getCheckboxCls(inCart: boolean, urgent: boolean): string {
  if (inCart) return 'border-market-500 bg-market-500 scale-105';
  if (urgent) return 'border-rose-300';
  return 'border-stone-300';
}

function getCalculatorLabel(hasEstimated: boolean, total: number): string {
  if (hasEstimated) return 'Estimado en carrito';
  if (total > 0) return 'Total en carrito';
  return 'Carrito';
}

function getPriceSubtitle(priceCount: number, total: number, inCartCount: number, hasEstimated: boolean): string {
  if (priceCount === 0) return `${total} ${total === 1 ? 'producto' : 'productos'} · escanea 📷 para ver el total`;
  const suffix = hasEstimated ? ' · precios estimados' : '';
  return `${priceCount} de ${inCartCount} con precio${suffix}`;
}

function getCategorySubtitle(urgentCount: number, total: number): string {
  const plural = total === 1 ? '' : 's';
  if (urgentCount > 0) {
    const urgentPlural = urgentCount === 1 ? '' : 's';
    return `${total} producto${plural} · ${urgentCount} urgente${urgentPlural}`;
  }
  return `${total} producto${plural}`;
}

interface CategoryGroup {
  readonly category: string;
  readonly emoji: string;
  readonly items: ShoppingListItem[];
  readonly urgentCount: number;
}

function groupByCategory(items: ShoppingListItem[]): CategoryGroup[] {
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const cat = item.product.category ?? 'Sin categoría';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  const groups: CategoryGroup[] = [];
  for (const [cat, catItems] of map) {
    const sorted = [...catItems].sort((a, b) => {
      if (a.product.stockLevel === 'empty' && b.product.stockLevel !== 'empty') return -1;
      if (b.product.stockLevel === 'empty' && a.product.stockLevel !== 'empty') return 1;
      return a.product.name.localeCompare(b.product.name, 'es');
    });
    groups.push({
      category: cat,
      emoji: categoryEmoji(cat === 'Sin categoría' ? null : cat),
      items: sorted,
      urgentCount: sorted.filter((i) => i.product.stockLevel === 'empty').length,
    });
  }
  return groups.sort((a, b) => {
    if (a.category === 'Sin categoría') return 1;
    if (b.category === 'Sin categoría') return -1;
    const orderA = CATEGORY_ORDER[a.category.toLowerCase()] ?? 50;
    const orderB = CATEGORY_ORDER[b.category.toLowerCase()] ?? 50;
    if (orderA !== orderB) return orderA - orderB;
    return a.category.localeCompare(b.category, 'es');
  });
}

export default function SupermarketView({ initialItems, pastStoreNames }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [completing, setCompleting] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    try {
      const s = sessionStorage.getItem('foody-mkt-quantities');
      return s ? (JSON.parse(s) as Record<string, number>) : {};
    } catch { return {}; }
  });
  const [searchFocused, setSearchFocused] = useState(false);
  const [scannedPrices, setScannedPrices] = useState<Record<string, number>>(() => {
    try {
      const s = sessionStorage.getItem('foody-mkt-prices');
      return s ? (JSON.parse(s) as Record<string, number>) : {};
    } catch { return {}; }
  });
  const [scanningProductId, setScanningProductId] = useState<string | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem('foody-mkt-prices', JSON.stringify(scannedPrices)); } catch { /* ignore */ }
  }, [scannedPrices]);

  useEffect(() => {
    try { sessionStorage.setItem('foody-mkt-quantities', JSON.stringify(quantities)); } catch { /* ignore */ }
  }, [quantities]);

  // Lock body scroll while the completion modal is open (mobile bottom sheet)
  useEffect(() => {
    if (!showModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showModal]);

  const { inCart, notInCart, urgent, low } = useMemo(() => {
    const inCart = items.filter((i) => i.isInCart);
    const notInCart = items.filter((i) => !i.isInCart);
    const urgent = notInCart.filter((i) => i.product.stockLevel === 'empty');
    // Must mirror the 'low' filter (=== 'half') or the chip count disagrees
    // with what the filter actually shows.
    const low = notInCart.filter((i) => i.product.stockLevel === 'half');
    return { inCart, notInCart, urgent, low };
  }, [items]);

  const progress = items.length === 0 ? 0 : (inCart.length / items.length) * 100;

  // Level-up moment: celebrate the first time the cart hits 100%
  const progressRef = useRef<HTMLDivElement>(null);
  const prevProgressRef = useRef(0);
  useEffect(() => {
    if (items.length > 0 && progress === 100 && prevProgressRef.current < 100) {
      playSound('levelup');
      haptic([20, 40, 20]);
      burstFromElement(progressRef.current, ['🎉', '🛒', '⭐']);
    }
    prevProgressRef.current = progress;
  }, [progress, items.length]);

  // How many units the user is buying of a product. Defaults to the needed
  // quantity (≥1), but the user can adjust it from the cart row.
  function getQty(item: ShoppingListItem): number {
    const q = quantities[item.product.id];
    if (q !== undefined && q > 0) return q;
    return item.quantityNeeded > 0 ? item.quantityNeeded : 1;
  }

  function setQty(productId: string, value: number) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, value) }));
  }

  const runningTotal = useMemo(() =>
    inCart.reduce((sum, item) => {
      const price = scannedPrices[item.product.id] ?? item.product.lastPurchasePrice ?? null;
      if (price === null) return sum;
      const q = quantities[item.product.id];
      const qty = q !== undefined && q > 0 ? q : Math.max(1, item.quantityNeeded);
      return sum + price * qty;
    }, 0),
  [inCart, scannedPrices, quantities]);
  const scannedCount = inCart.filter((i) => scannedPrices[i.product.id] !== undefined).length;
  const estimatedCount = inCart.filter(
    (i) => scannedPrices[i.product.id] === undefined && i.product.lastPurchasePrice !== null,
  ).length;
  const priceCount = scannedCount + estimatedCount;
  const hasEstimated = estimatedCount > 0;
  const totalMatchesCalculated =
    runningTotal > 0 &&
    Math.abs((Number.parseFloat(totalAmount) || 0) - runningTotal) < 0.01;

  function replaceItem(id: string, updated: ShoppingListItem) {
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  function optimisticToggle(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isInCart: !i.isInCart } : i)),
    );
  }

  async function fetchToggle(id: string, original: ShoppingListItem) {
    const res = await fetch(
      `/api/proxy/shopping-list/${id}/toggle-cart`,
      { method: 'PATCH', credentials: 'include' },
    );
    if (res.ok) {
      const updated: ShoppingListItem = await res.json();
      replaceItem(id, updated);
    } else {
      // Roll back optimistic update on failure
      replaceItem(id, original);
    }
  }

  function toggleItem(id: string, el?: Element | null) {
    haptic(12);
    const original = items.find((i) => i.id === id);
    if (!original) return;
    if (!original.isInCart) {
      playSound('pop');
      burstFromElement(el, ['🛒', '✨', '🥳']);
    }
    optimisticToggle(id);
    startTransition(() => {
      void fetchToggle(id, original);
    });
  }

  function openModal() {
    if (inCart.length === 0) return;
    // Seed any quantity the user hasn't set yet, without overwriting their input.
    setQuantities((prev) => {
      const next = { ...prev };
      for (const item of inCart) {
        next[item.product.id] ??= Math.max(1, item.quantityNeeded);
      }
      return next;
    });
    // Prefill with the most-visited store — leaving it blank files the trip
    // under "Sin tienda". The user can still clear or change it.
    if (!storeName && pastStoreNames && pastStoreNames.length > 0) {
      setStoreName(pastStoreNames[0]);
    }
    // Auto-fill the total with the calculated amount so the user only confirms.
    if (runningTotal > 0) {
      setTotalAmount(runningTotal.toFixed(2));
    }
    setShowModal(true);
    haptic(12);
  }

  function closeModal() {
    setShowModal(false);
  }

  async function confirmShopping() {
    if (inCart.length === 0) return;
    setCompleting(true);
    haptic([25, 50, 25]);

    try {
      const res = await fetch('/api/shopping-list/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: storeName.trim() || undefined,
          totalAmount: totalAmount.trim() ? Number.parseFloat(totalAmount) : undefined,
          quantities,
          unitPrices: Object.keys(scannedPrices).length > 0 ? scannedPrices : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        playSound('purchase');
        confettiRain(['🛒', '🎉', '🥳']);
        if (data.purchaseError) {
          toast.show('Compra guardada, pero algunos precios no se pudieron guardar.', 'info');
        } else {
          toast.show('¡Compra registrada! ✓', 'success');
        }
        setShowModal(false);
        setStoreName('');
        setTotalAmount('');
        setQuantities({});
        setScannedPrices({});
        try { sessionStorage.removeItem('foody-mkt-prices'); sessionStorage.removeItem('foody-mkt-quantities'); } catch { /* ignore */ }
        setItems((prev) => prev.filter((i) => !i.isInCart));
        router.refresh();
      } else {
        toast.show('No se pudo completar la compra. Intenta de nuevo.', 'error');
      }
    } catch {
      toast.show('Sin conexión. Verifica tu red e inténtalo de nuevo.', 'error');
    } finally {
      setCompleting(false);
    }
  }

  // Filtered + category-grouped list. Memoised so it isn't re-sorted/re-grouped
  // on unrelated re-renders (cart quantity edits, modal input, price scans).
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = notInCart.filter((i) => {
      if (q && !i.product.name.toLowerCase().includes(q)) return false;
      if (filter === 'urgent' && i.product.stockLevel !== 'empty') return false;
      if (filter === 'low' && i.product.stockLevel !== 'half') return false;
      if (categoryFilter && (i.product.category ?? 'Sin categoría') !== categoryFilter) return false;
      return true;
    });
    return groupByCategory(filtered);
  }, [notInCart, search, filter, categoryFilter]);

  // Categories present in the "not in cart" list for the category filter row
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const i of notInCart) {
      cats.add(i.product.category ?? 'Sin categoría');
    }
    return [...cats].sort((a, b) => {
      if (a === 'Sin categoría') return 1;
      if (b === 'Sin categoría') return -1;
      const oa = CATEGORY_ORDER[a.toLowerCase()] ?? 50;
      const ob = CATEGORY_ORDER[b.toLowerCase()] ?? 50;
      return oa === ob ? a.localeCompare(b, 'es') : oa - ob;
    });
  }, [notInCart]);

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-6xl mb-4"><span className="inline-block animate-bounce">🎉</span></p>
        <h2 className="text-xl font-semibold text-stone-600 mb-2">¡Lista vacía!</h2>
        <p className="text-stone-400">
          No tienes productos marcados para comprar.
        </p>
        <Link href="/home" className="mt-4 inline-block text-brand-500 hover:underline">
          Volver a casa
        </Link>
      </div>
    );
  }

  return (
    <LayoutGroup>
    <div className="space-y-5 pb-32">
      {/* ─── Progress (game-style: striped bar + cart riding the tip) ───────── */}
      <div ref={progressRef} className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-100 dark:border-stone-800 shadow-sm">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">
            {progress === 100 ? (
              <span className="inline-block animate-pop">🎉 ¡Carrito completo!</span>
            ) : (
              `${inCart.length} / ${items.length} en el carrito`
            )}
          </span>
          <span className={`text-xs ${progress === 100 ? 'font-bold text-market-600' : 'text-stone-400'}`}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="relative h-3 bg-stone-100 dark:bg-stone-800 rounded-full">
          <div
            className="progress-fun h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 -translate-y-1/2 text-base leading-none drop-shadow-sm transition-all duration-500 ease-out"
            style={{ left: `calc(${Math.min(Math.max(progress, 1), 97)}% - 8px)` }}
          >
            🛒
          </span>
        </div>
      </div>

      {/* ─── Calculator banner ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {inCart.length > 0 && (
          <motion.div
            key="cart-calculator"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="bg-linear-to-br from-market-50 to-emerald-50 border border-market-200 rounded-2xl px-4 py-3 shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-market-600 uppercase tracking-wider mb-0.5">
                  🧮 {getCalculatorLabel(hasEstimated, runningTotal)}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-market-700">$</span>
                  <motion.span
                    key={Math.round(runningTotal * 100)}
                    initial={{ y: 6, opacity: 0.6 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 18 }}
                    className="text-3xl font-black text-market-800 tabular-nums"
                  >
                    {runningTotal > 0 ? runningTotal.toFixed(2) : '0.00'}
                  </motion.span>
                </div>
                <p className="text-[11px] text-market-600/70 mt-0.5">
                  {getPriceSubtitle(priceCount, runningTotal, inCart.length, hasEstimated)}
                </p>
              </div>

              <div className="flex flex-col items-center justify-center bg-market-600 text-white rounded-xl px-3 py-2 shrink-0 shadow-sm">
                <motion.span
                  key={inCart.length}
                  initial={{ scale: 0.65, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 14 }}
                  className="text-2xl font-black tabular-nums leading-none"
                >
                  {inCart.length}
                </motion.span>
                <span className="text-[10px] font-medium opacity-80 mt-0.5">
                  {pluralize(inCart.length, 'ítem', 'ítems')}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Modo compra rápida banner ─────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 bg-indigo-950/80 border border-indigo-700/40 rounded-2xl px-4 py-2.5">
        <span className="text-base shrink-0">⚡</span>
        <p className="text-xs text-indigo-200 leading-snug">
          <span className="font-bold text-white">Modo compra rápida</span>
          {' '}· Marca lo que compras y al finalizar tu despensa se actualiza sola
        </p>
      </div>

      {/* ─── Search + filters ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="relative">
          <motion.span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none select-none"
            animate={
              search
                ? { scale: [1, 1.35, 0.9, 1.1, 1], rotate: [0, -18, 12, -6, 0], y: [0, -3, 2, -1, 0] }
                : { scale: [1, 1.08, 1], y: [0, -2, 0] }
            }
            transition={
              search
                ? { type: 'spring', stiffness: 450, damping: 12 }
                : { duration: 2, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }
            }
          >
            🔍
          </motion.span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder=""
            aria-label="Buscar producto"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
          />
          {!search && !searchFocused && (
            <motion.span
              className="absolute left-9 top-1/2 -translate-y-1/2 text-stone-300 text-sm pointer-events-none select-none"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              Escribe para buscar un producto…
            </motion.span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {([
            { k: 'all', label: `Todos · ${notInCart.length}` },
            { k: 'urgent', label: `🚨 Se acabó · ${urgent.length}` },
            { k: 'low', label: `⚠️ Bajo · ${low.length}` },
          ] as { k: Filter; label: string }[]).map(({ k, label }) => (
            <motion.button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === k
                  ? 'bg-market-600 text-white shadow-sm'
                  : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-market-300'
              }`}
              whileHover={{ scale: 1.07 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              {label}
            </motion.button>
          ))}
        </div>

        {/* Category filter chips */}
        {availableCategories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            <motion.button
              onClick={() => setCategoryFilter(null)}
              aria-pressed={categoryFilter === null}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                categoryFilter === null
                  ? 'bg-stone-700 text-white shadow-sm'
                  : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-400'
              }`}
              whileHover={{ scale: 1.07 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              📂 Todas
            </motion.button>
            {availableCategories.map((cat) => (
              <motion.button
                key={cat}
                onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                aria-pressed={categoryFilter === cat}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  categoryFilter === cat
                    ? 'bg-stone-700 text-white shadow-sm'
                    : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-400'
                }`}
                whileHover={{ scale: 1.07 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                {categoryEmoji(cat)} {cat}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Empty results (filters/search) or everything already in cart ──── */}
      {visibleGroups.length === 0 && notInCart.length > 0 && (
        <div className="text-center py-8 bg-white dark:bg-stone-900 rounded-2xl border border-dashed border-stone-200 dark:border-stone-700">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">No hay productos que coincidan</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setFilter('all'); setCategoryFilter(null); }}
            className="mt-3 px-4 py-1.5 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
          >
            Limpiar filtros
          </button>
        </div>
      )}
      {notInCart.length === 0 && inCart.length > 0 && (
        <div className="text-center py-8 bg-market-50/60 dark:bg-market-900/20 rounded-2xl border border-market-200 dark:border-market-800">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-semibold text-market-700 dark:text-market-300">
            ¡Todo está en el carrito!
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Toca «Finalizar compra» abajo para registrarla
          </p>
        </div>
      )}

      {/* ─── Category groups ────────────────────────────────────────────────── */}
      {visibleGroups.map(({ category, emoji, items: catItems, urgentCount }) => (
        <Section
          key={category}
          title={`${emoji} ${category}`}
          subtitle={getCategorySubtitle(urgentCount, catItems.length)}
          badgeCls={urgentCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}
        >
          {catItems.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={(el) => toggleItem(item.id, el)}
              disabled={isPending}
              urgent={item.product.stockLevel === 'empty'}
            />
          ))}
        </Section>
      ))}

      {/* ─── Comprados ───────────────────────────────────────────────────────── */}
      {inCart.length > 0 && (
        <Section
          title="✔️ Comprados"
          subtitle={
            runningTotal > 0
              ? `${inCart.length} ${pluralize(inCart.length, 'producto', 'productos')} · ${hasEstimated ? '≈' : ''}$${runningTotal.toFixed(2)}`
              : `${inCart.length} ${pluralize(inCart.length, 'producto', 'productos')} · toca 📷 para registrar precios`
          }
          badgeCls="bg-green-100 text-green-700"
        >
          {scannedCount === 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-market-50 border border-market-200 rounded-xl mb-1">
              <span className="text-lg shrink-0">📷</span>
              <p className="text-xs text-market-700 leading-snug">
                Toca el precio <strong>(📷)</strong> en cada producto para registrar cuánto costó y llevar el total automático
              </p>
            </div>
          )}
          {inCart.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={(el) => toggleItem(item.id, el)}
              disabled={isPending}
              inCart
              scannedPrice={scannedPrices[item.product.id]}
              onScanPrice={() => setScanningProductId(item.product.id)}
              quantity={getQty(item)}
              onQtyChange={(v) => setQty(item.product.id, v)}
            />
          ))}
        </Section>
      )}

      {/* ─── Floating complete button ───────────────────────────────────────── */}
      {inCart.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-40 md:left-auto md:right-8 md:w-96 pb-[env(safe-area-inset-bottom)]">
          <motion.button
            onClick={openModal}
            disabled={completing}
            className={`w-full bg-linear-to-r from-market-500 to-market-700 hover:from-market-600 hover:to-market-800 text-white font-bold py-4 rounded-2xl text-base transition-all shadow-xl shadow-market-500/30 disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2${notInCart.length === 0 ? ' animate-glow' : ''}`}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          >
            {completing ? (
              'Procesando...'
            ) : (
              <>
                <motion.span
                  animate={{ rotate: [0, -15, 10, -6, 0], y: [0, -3, 1, -1, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
                >
                  <ShoppingCartIcon className="w-5 h-5" />
                </motion.span>
                {runningTotal > 0
                  ? `Finalizar · $${runningTotal.toFixed(2)} · ${inCart.length} ${pluralize(inCart.length, 'item', 'items')}`
                  : `Finalizar compra · ${inCart.length} ${pluralize(inCart.length, 'item', 'items')}`}
              </>
            )}
          </motion.button>
        </div>
      )}

      {/* ─── Price scanner modal ─────────────────────────────────────────────── */}
      {scanningProductId && (
        <PriceScannerModal
          productName={items.find((i) => i.product.id === scanningProductId)?.product.name ?? ''}
          onPrice={(price) => {
            setScannedPrices((prev) => ({ ...prev, [scanningProductId]: price }));
            setScanningProductId(null);
            haptic(20);
          }}
          onClose={() => setScanningProductId(null)}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
            onClick={closeModal}
            onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
          />

          {/* Card */}
          <div className="relative w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 max-h-[88dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">🛒 Finalizar compra</h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500 transition"
              >
                ✕
              </button>
            </div>

            {/* Store name */}
            <label
              htmlFor="modal-store-name"
              className="block text-sm font-semibold text-stone-700 dark:text-stone-200 mb-1.5"
            >
              ¿En qué supermercado compraste?
            </label>
            <input
              id="modal-store-name"
              list="store-suggestions"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Ej. Walmart, Soriana, HEB…"
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition mb-4"
            />
            {pastStoreNames && pastStoreNames.length > 0 && (
              <datalist id="store-suggestions">
                {pastStoreNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}

            {/* Total amount */}
            <label
              htmlFor="modal-total-amount"
              className="block text-sm font-semibold text-stone-700 dark:text-stone-200 mb-1.5"
            >
              ¿Cuánto gastaste en total?
            </label>
            <div className="relative mb-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">$</span>
              <input
                id="modal-total-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
              />
            </div>
            <p className="text-xs text-stone-400 mb-4">
              {(() => {
                if (!runningTotal) return 'Escanea los precios para sumar el total automáticamente, o escríbelo a mano.';
                if (totalMatchesCalculated) return '✓ Sumado automáticamente. Si es correcto, confirma; si no, ajústalo arriba.';
                return '✏️ Lo ajustaste manualmente. Toca «Usar» para volver al total calculado.';
              })()}
            </p>

            {/* Quantities + Prices */}
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">
              Cantidad y precio por producto
            </p>

            {/* Calculated total pill */}
            {runningTotal > 0 && (
              <div className="flex items-center justify-between bg-market-50 border border-market-200 rounded-xl px-3 py-2 mb-3">
                <span className="text-sm text-market-700 font-medium">
                  💰 Total calculado ({scannedCount}/{inCart.length})
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-market-700">${runningTotal.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => setTotalAmount(runningTotal.toFixed(2))}
                    className="text-xs px-2.5 py-0.5 rounded-full bg-market-600 text-white font-semibold transition hover:bg-market-700"
                  >
                    Usar
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 mb-5 pr-1">
              {inCart.map((item) => {
                const qty = quantities[item.product.id] ?? item.quantityNeeded;
                const unitPrice = scannedPrices[item.product.id];
                const lineTotal = unitPrice === undefined ? null : unitPrice * (qty || 1);
                return (
                  <div
                    key={item.id}
                    className="bg-stone-50 dark:bg-stone-800 rounded-xl px-3 py-2.5 border border-stone-100 dark:border-stone-700"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate min-w-0">
                        {item.product.name}
                      </span>
                      {lineTotal !== null && (
                        <span className="text-xs font-bold text-market-700 shrink-0">
                          ${lineTotal.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={qty === 0 ? '' : qty}
                          placeholder="0"
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            setQuantities((prev) => ({ ...prev, [item.product.id]: val }));
                          }}
                          className="w-14 text-center text-sm font-bold text-stone-800 bg-white border border-stone-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
                        />
                        {item.product.unit && (
                          <span className="text-xs text-stone-400">{item.product.unit}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setScanningProductId(item.product.id)}
                        className={`ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                          unitPrice === undefined
                            ? 'bg-white border-stone-200 text-stone-500 hover:border-market-300'
                            : 'bg-market-50 border-market-300 text-market-700 hover:bg-market-100'
                        }`}
                      >
                        <span>📷</span>
                        <span>{unitPrice === undefined ? 'Precio' : `$${unitPrice.toFixed(2)}`}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pb-[env(safe-area-inset-bottom)]">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-3 rounded-2xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 font-semibold text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmShopping}
                disabled={completing}
                className="flex-1 py-3 rounded-2xl bg-market-600 hover:bg-market-700 text-white font-bold text-sm transition disabled:opacity-50 active:scale-[0.98]"
              >
                {completing ? 'Guardando…' : '✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </LayoutGroup>
  );
}

function Section({
  title,
  subtitle,
  badgeCls,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly badgeCls: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide">
          {title}
        </h2>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>
          {subtitle}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ShoppingItemRow({
  item,
  onToggle,
  disabled,
  inCart = false,
  urgent = false,
  scannedPrice,
  onScanPrice,
  quantity,
  onQtyChange,
}: {
  readonly item: ShoppingListItem;
  readonly onToggle: (el?: Element | null) => void;
  readonly disabled: boolean;
  readonly inCart?: boolean;
  readonly urgent?: boolean;
  readonly scannedPrice?: number;
  readonly onScanPrice?: () => void;
  readonly quantity?: number;
  readonly onQtyChange?: (value: number) => void;
}) {
  const product = item.product;
  const rowCls = getRowCls(inCart, urgent);
  const checkboxCls = getCheckboxCls(inCart, urgent);
  const showCartControls = inCart && !!onScanPrice;
  const qty = quantity && quantity > 0 ? quantity : Math.max(1, item.quantityNeeded);
  const lineTotal = scannedPrice === undefined ? undefined : scannedPrice * qty;

  return (
    <motion.div
      layout
      layoutId={item.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className={`w-full rounded-2xl border transition-colors ${rowCls}`}
    >
      <div className="flex items-center gap-2 p-3">
      {/* Toggle area */}
      <button
        onClick={(e) => onToggle(e.currentTarget)}
        disabled={disabled}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] disabled:opacity-60"
      >
        {/* Checkbox */}
        <div
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${checkboxCls}`}
        >
          {inCart && (
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 15 }}
              className="text-white text-xs font-bold"
            >
              ✓
            </motion.span>
          )}
        </div>

        {/* Photo */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 shrink-0">
          {product.photoUrl ? (
            <Image
              src={product.photoUrl}
              alt={product.name}
              width={48}
              height={48}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl">
              <motion.span
                animate={{ rotate: [0, -12, 10, -5, 0], y: [0, -3, 1, -1, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
              >
                🛒
              </motion.span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p
              className={`font-semibold text-sm truncate ${
                inCart ? 'line-through text-stone-400' : 'text-stone-800 dark:text-stone-100'
              }`}
            >
              {product.name}
            </p>
            {urgent && !inCart && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                Urgente
              </span>
            )}
          </div>
          {product.category && (
            <p className="text-xs text-stone-400 truncate">{product.category}</p>
          )}
        </div>

        {/* Status badge — not-in-cart or in-cart without scan */}
        {!inCart && (
          <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-stone-400 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded-full">
            🛒 {item.quantityNeeded}{product.unit ? ` ${product.unit}` : ''}
          </span>
        )}
        {inCart && !onScanPrice && (
          <span className="shrink-0 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            ✔ Comprado
          </span>
        )}
      </button>
      </div>

      {/* Footer: quantity stepper + price (in-cart + scan enabled) */}
      {showCartControls && (
        <div className="flex items-center gap-2 px-3 pb-3 -mt-1">
          {/* Quantity stepper — "¿cuántas piezas compraste?" */}
          <div className="flex items-center gap-0.5 bg-white border border-stone-200 rounded-xl p-0.5">
            <button
              type="button"
              aria-label="Quitar una unidad"
              onClick={() => onQtyChange?.(Math.max(1, qty - 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 active:scale-90 transition text-lg font-bold"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label={`Cantidad de ${product.name}`}
              value={qty}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') { onQtyChange?.(0); return; }
                const n = Number(raw);
                if (Number.isFinite(n)) onQtyChange?.(n);
              }}
              className="w-9 text-center text-sm font-bold text-stone-800 bg-transparent focus:outline-none tabular-nums"
            />
            <button
              type="button"
              aria-label="Agregar una unidad"
              onClick={() => onQtyChange?.(qty + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 active:scale-90 transition text-lg font-bold"
            >
              ＋
            </button>
            {product.unit && (
              <span className="text-[10px] text-stone-400 pr-1.5">{product.unit}</span>
            )}
          </div>

          {/* Line total once a price is captured */}
          {lineTotal !== undefined && (
            <span className="text-xs font-bold text-market-700 tabular-nums">
              = ${lineTotal.toFixed(2)}
            </span>
          )}

          {/* Camera / price button */}
          <button
            type="button"
            onClick={onScanPrice}
            className={`ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
              scannedPrice === undefined
                ? 'bg-stone-50 border-stone-200 text-stone-400 hover:border-market-300 hover:text-market-600'
                : 'bg-market-50 border-market-300 text-market-700'
            }`}
          >
            <span className="text-base leading-none">📷</span>
            <span>{scannedPrice === undefined ? 'precio c/u' : `$${scannedPrice.toFixed(2)} c/u`}</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}
