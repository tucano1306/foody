'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import type { ShoppingListItem } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstFromElement, confettiRain } from '@/lib/fx';
import { useToast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { CATEGORY_ORDER, categoryEmoji } from '@/lib/categories';

const PriceScannerModal = dynamic(() => import('./PriceScannerModal'), { ssr: false });
const PhotoLightbox = dynamic(() => import('@/components/ui/PhotoLightbox'), { ssr: false });

interface Props {
  readonly initialItems: ShoppingListItem[];
  readonly pastStoreNames?: readonly string[];
}

type Filter = 'all' | 'urgent' | 'low';

/**
 * One priced batch of a product: a meat tray with its own sticker, a bag of
 * produce weighed at the scale, a large vs. small bottle of the same thing,
 * or N identical units. `qty` is how many units/lbs the batch has and `total`
 * what that batch costs altogether. A product can hold several entries (two
 * trays, or one olive oil grande + one pequeño, each with its own price);
 * `label` is an optional user note to tell the entries apart.
 */
interface PriceEntry {
  qty: number;
  /** Total paid for this batch (mode 'unit'): what the sticker says. */
  total: number | null;
  label?: string;
  /** 'unit' (default): qty units + batch total. 'lb': qty pounds + price per
   * pound — the app multiplies (produce like tomatoes/onions/limes is sold
   * both ways, so each entry picks its own mode). */
  mode?: 'unit' | 'lb';
  /** Price per pound (mode 'lb'). */
  unitPrice?: number | null;
}

/** Effective money of one entry regardless of its mode. */
function entryTotal(e: PriceEntry): number {
  if (e.mode === 'lb') {
    return e.unitPrice != null && e.qty > 0 ? Math.round(e.qty * e.unitPrice * 100) / 100 : 0;
  }
  return e.total ?? 0;
}

function entryHasPrice(e: PriceEntry): boolean {
  return e.mode === 'lb' ? e.unitPrice != null : e.total !== null;
}

interface PersistedState {
  entries: Record<string, PriceEntry[]>;
  cartTimes: Record<string, number>;
  storeName: string;
  totalAmount: string;
}

// localStorage (not sessionStorage): the in-progress shopping session must
// survive the phone locking, the PWA being killed, or an accidental close.
const STORAGE_KEY = 'foody-market-session-v2';

function loadPersisted(): PersistedState {
  const empty: PersistedState = { entries: {}, cartTimes: {}, storeName: '', totalAmount: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      entries: parsed.entries ?? {},
      cartTimes: parsed.cartTimes ?? {},
      storeName: parsed.storeName ?? '',
      totalAmount: parsed.totalAmount ?? '',
    };
  } catch {
    return empty;
  }
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** Accent/case-insensitive haystack match: "vitáminas" finds "Vitaminas". */
function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function textMatches(haystack: string, normalizedNeedle: string): boolean {
  return normalizeText(haystack).includes(normalizedNeedle);
}

/** Sold-by-weight heuristic from the product's unit (lb, libras, kg, oz…). */
function isWeightUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return /\b(lb|lbs|libra|libras|kg|kilo|kilos|oz|onza|onzas|gr|gramo|gramos)\b/i.test(unit);
}

function entriesQty(entries: PriceEntry[] | undefined, fallback: number): number {
  if (!entries || entries.length === 0) return fallback;
  const sum = entries.reduce((s, e) => s + (Number.isFinite(e.qty) ? e.qty : 0), 0);
  return sum > 0 ? sum : fallback;
}

function entriesTotal(entries: PriceEntry[] | undefined): number {
  if (!entries) return 0;
  return entries.reduce((s, e) => s + entryTotal(e), 0);
}

function defaultEntries(item: ShoppingListItem): PriceEntry[] {
  return [{ qty: Math.max(1, item.quantityNeeded), total: null }];
}

function fmtQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    if (a === 'Sin categoría') return 1;
    if (b === 'Sin categoría') return -1;
    const oa = CATEGORY_ORDER[a.toLowerCase()] ?? 50;
    const ob = CATEGORY_ORDER[b.toLowerCase()] ?? 50;
    return oa === ob ? a.localeCompare(b, 'es') : oa - ob;
  });
}

export default function SupermarketView({ initialItems, pastStoreNames }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const [completing, setCompleting] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // ─── Persisted shopping session (survives app close) ───────────────────────
  const [hydrated, setHydrated] = useState(false);
  const [entries, setEntries] = useState<Record<string, PriceEntry[]>>({});
  const [cartTimes, setCartTimes] = useState<Record<string, number>>({});
  const [storeName, setStoreName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

  useEffect(() => {
    const persisted = loadPersisted();
    setEntries(persisted.entries);
    setCartTimes(persisted.cartTimes);
    setStoreName(persisted.storeName);
    setTotalAmount(persisted.totalAmount);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, cartTimes, storeName, totalAmount } satisfies PersistedState));
    } catch { /* storage full/blocked — keep going, worst case state is in memory */ }
  }, [hydrated, entries, cartTimes, storeName, totalAmount]);

  function clearSession() {
    setEntries({});
    setCartTimes({});
    setStoreName('');
    setTotalAmount('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  // ─── Editor / lightbox / scanner targets ───────────────────────────────────
  const [editorItemId, setEditorItemId] = useState<string | null>(null);
  const [scanTarget, setScanTarget] = useState<{ productId: string; index: number } | null>(null);
  const [zoomItem, setZoomItem] = useState<{ src: string; alt: string; origin?: DOMRect } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ShoppingListItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Lock body scroll while a sheet/modal is open (mobile bottom sheets)
  const anySheetOpen = showModal || editorItemId !== null || showAddSheet;
  useEffect(() => {
    if (!anySheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [anySheetOpen]);

  const { inCart, notInCart, urgent, low } = useMemo(() => {
    const inCart = items.filter((i) => i.isInCart);
    const notInCart = items.filter((i) => !i.isInCart);
    const urgent = notInCart.filter((i) => i.product.stockLevel === 'empty');
    const low = notInCart.filter((i) => i.product.stockLevel === 'half');
    return { inCart, notInCart, urgent, low };
  }, [items]);

  const progress = items.length === 0 ? 0 : (inCart.length / items.length) * 100;

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

  // ─── Totals ─────────────────────────────────────────────────────────────────
  const { runningTotal, pricedCount, estimatedCount } = useMemo(() => {
    let total = 0;
    let priced = 0;
    let estimated = 0;
    for (const item of inCart) {
      const lineTotal = entriesTotal(entries[item.product.id]);
      if (lineTotal > 0) {
        total += lineTotal;
        priced += 1;
      } else if (item.product.lastPurchasePrice !== null) {
        total += item.product.lastPurchasePrice * entriesQty(entries[item.product.id], Math.max(1, item.quantityNeeded));
        estimated += 1;
      }
    }
    return { runningTotal: total, pricedCount: priced, estimatedCount: estimated };
  }, [inCart, entries]);

  const hasEstimated = estimatedCount > 0;

  // ─── Cart toggle ────────────────────────────────────────────────────────────
  function replaceItem(id: string, updated: ShoppingListItem) {
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
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
      replaceItem(id, original);
    }
  }

  function toggleItem(id: string, el?: Element | null) {
    haptic(12);
    const original = items.find((i) => i.id === id);
    if (!original) return;
    const pid = original.product.id;
    if (original.isInCart) {
      playSound('uncart');
      setCartTimes((prev) => {
        const next = { ...prev };
        delete next[pid];
        return next;
      });
    } else {
      playSound('cart');
      burstFromElement(el, ['🛒', '✨', '🥳']);
      // Recency stamp: the most recently grabbed product leads the "Comprados"
      // section so pricing it right after picking it up is one tap away.
      setCartTimes((prev) => ({ ...prev, [pid]: Date.now() }));
      setEntries((prev) => (prev[pid]?.length ? prev : { ...prev, [pid]: defaultEntries(original) }));
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isInCart: !i.isInCart } : i)));
    startTransition(() => { void fetchToggle(id, original); });
  }

  // ─── Remove from list ("no estaba en el súper") ─────────────────────────────
  async function performRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoving(true);
    setItems((prev) => prev.filter((i) => i.id !== target.id));
    try {
      const res = await fetch(`/api/proxy/shopping-list/${target.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok || res.status === 404) {
        toast.show(`"${target.product.name}" quitado de la lista`, 'success');
      } else {
        setItems((prev) => [...prev, target]);
        toast.show('No se pudo quitar. Intenta de nuevo.', 'error');
      }
    } catch {
      setItems((prev) => [...prev, target]);
      toast.show('Sin conexión. Intenta de nuevo.', 'error');
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
      setEditorItemId((cur) => (cur === target.id ? null : cur));
    }
  }

  // ─── Add a product to today's list ──────────────────────────────────────────
  function handleAdded(newItem: ShoppingListItem) {
    setItems((prev) => (prev.some((i) => i.product.id === newItem.product.id) ? prev : [newItem, ...prev]));
    toast.show(`"${newItem.product.name}" agregado a la lista ✓`, 'success');
    // Gentle minor-ish tone: joining the shopping list means something ran out.
    playSound('low');
    haptic(12);
  }

  // ─── Price entries ──────────────────────────────────────────────────────────
  function getEntriesFor(item: ShoppingListItem): PriceEntry[] {
    const list = entries[item.product.id];
    return list && list.length > 0 ? list : defaultEntries(item);
  }

  function updateEntries(productId: string, updater: (prev: PriceEntry[]) => PriceEntry[], item: ShoppingListItem) {
    setEntries((prev) => {
      const current = prev[productId]?.length ? prev[productId] : defaultEntries(item);
      return { ...prev, [productId]: updater(current) };
    });
  }

  // ─── Finalize ───────────────────────────────────────────────────────────────
  function openModal() {
    if (inCart.length === 0) return;
    if (!storeName && pastStoreNames && pastStoreNames.length > 0) {
      setStoreName(pastStoreNames[0]);
    }
    if (runningTotal > 0) {
      setTotalAmount(runningTotal.toFixed(2));
    }
    setShowModal(true);
    haptic(12);
  }

  async function confirmShopping() {
    if (inCart.length === 0) return;
    setCompleting(true);
    haptic([25, 50, 25]);

    // Collapse each product's entries into what the API stores: total quantity
    // bought and the effective unit price (mixed-price trays average out so
    // qty × unitPrice always equals what was really paid).
    const quantities: Record<string, number> = {};
    const unitPrices: Record<string, number> = {};
    for (const item of inCart) {
      const list = getEntriesFor(item);
      const qty = entriesQty(list, Math.max(1, item.quantityNeeded));
      const lineTotal = entriesTotal(list);
      quantities[item.product.id] = qty;
      if (lineTotal > 0 && qty > 0) {
        unitPrices[item.product.id] = lineTotal / qty;
      }
    }

    try {
      const res = await fetch('/api/shopping-list/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: storeName.trim() || undefined,
          totalAmount: totalAmount.trim() ? Number.parseFloat(totalAmount) : undefined,
          quantities,
          unitPrices: Object.keys(unitPrices).length > 0 ? unitPrices : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        playSound('purchase');
        confettiRain(['🛒', '🎉', '🥳']);
        if (data.purchaseError) {
          toast.show('Compra guardada, pero algunos precios no se pudieron guardar.', 'info');
        } else {
          toast.show('¡Compra registrada! Tu despensa se actualizó ✓', 'success');
        }
        setShowModal(false);
        clearSession();
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

  // ─── Search + filters (cover BOTH pending and purchased) ────────────────────
  const q = normalizeText(search.trim());

  function matches(item: ShoppingListItem): boolean {
    if (q) {
      if (
        !textMatches(item.product.name, q) &&
        !textMatches(item.product.category ?? 'Sin categoría', q)
      ) return false;
    }
    if (categoryFilter && (item.product.category ?? 'Sin categoría') !== categoryFilter) return false;
    return true;
  }

  const visiblePending = useMemo(() => {
    const filtered = notInCart.filter((i) => {
      if (!matches(i)) return false;
      if (filter === 'urgent' && i.product.stockLevel !== 'empty') return false;
      if (filter === 'low' && i.product.stockLevel !== 'half') return false;
      return true;
    });
    // Urgent first inside the pending grid, then category order, then name.
    return [...filtered].sort((a, b) => {
      const ua = a.product.stockLevel === 'empty' ? 0 : 1;
      const ub = b.product.stockLevel === 'empty' ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const ca = CATEGORY_ORDER[(a.product.category ?? '').toLowerCase()] ?? 50;
      const cb = CATEGORY_ORDER[(b.product.category ?? '').toLowerCase()] ?? 50;
      if (ca !== cb) return ca - cb;
      return a.product.name.localeCompare(b.product.name, 'es');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notInCart, q, filter, categoryFilter]);

  // Purchased: most recently grabbed first — the item just picked up is the
  // one whose price the user wants to type right now.
  const visiblePurchased = useMemo(() => {
    const filtered = inCart.filter((i) => matches(i));
    return [...filtered].sort((a, b) => (cartTimes[b.product.id] ?? 0) - (cartTimes[a.product.id] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCart, q, categoryFilter, cartTimes]);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const i of items) cats.add(i.product.category ?? 'Sin categoría');
    return sortCategories([...cats]);
  }, [items]);

  const searching = q.length > 0 || categoryFilter !== null || filter !== 'all';
  const editorItem = editorItemId ? items.find((i) => i.id === editorItemId) ?? null : null;

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-6xl mb-4"><span className="inline-block animate-bounce">🎉</span></p>
        <h2 className="text-xl font-semibold text-stone-600 mb-2">¡Lista vacía!</h2>
        <p className="text-stone-400">No tienes productos marcados para comprar.</p>
        <button
          type="button"
          onClick={() => setShowAddSheet(true)}
          className="mt-5 px-5 py-2.5 rounded-xl bg-market-600 hover:bg-market-700 text-white text-sm font-bold transition active:scale-95 shadow-sm"
        >
          ＋ Agregar un producto a la lista
        </button>
        <p className="mt-3">
          <Link href="/home" className="text-brand-500 hover:underline text-sm">
            Volver a casa
          </Link>
        </p>
        {showAddSheet && (
          <AddProductSheet
            existingProductIds={new Set(items.map((i) => i.product.id))}
            onAdded={handleAdded}
            onClose={() => setShowAddSheet(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32">
      {/* ─── Progress ────────────────────────────────────────────────────────── */}
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

      {/* ─── Cart calculator ─────────────────────────────────────────────────── */}
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
                  🧮 {hasEstimated ? 'Estimado en carrito' : 'Total en carrito'}
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
                  {pricedCount === 0
                    ? `${inCart.length} en el carrito · toca 💵 en un producto para poner su precio`
                    : `${pricedCount} de ${inCart.length} con precio${hasEstimated ? ' · algunos estimados' : ''}`}
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

      {/* ─── Search + add + filters ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none select-none">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Busca un producto o categoría…"
              aria-label="Buscar producto o categoría"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
            />
            {search && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            className="shrink-0 px-3.5 py-2.5 rounded-xl bg-market-600 hover:bg-market-700 text-white text-sm font-bold transition active:scale-95 shadow-sm"
          >
            ＋ Agregar
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {([
            { k: 'all', label: `Todos · ${notInCart.length}` },
            { k: 'urgent', label: `🚨 Se acabó · ${urgent.length}` },
            { k: 'low', label: `⚠️ Bajo · ${low.length}` },
          ] as { k: Filter; label: string }[]).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                filter === k
                  ? 'bg-market-600 text-white shadow-sm'
                  : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-market-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {availableCategories.length > 1 && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none select-none">📂</span>
            <select
              value={categoryFilter ?? ''}
              onChange={(e) => setCategoryFilter(e.target.value || null)}
              aria-label="Filtrar por categoría"
              className="w-full appearance-none pl-9 pr-9 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-market-300 transition cursor-pointer"
            >
              <option value="">📂 Todas las categorías</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryEmoji(cat)} {cat}
                </option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none select-none">▾</span>
          </div>
        )}
      </div>

      {/* ─── Search verdict: nothing pending, but maybe already bought ───────── */}
      {searching && visiblePending.length === 0 && visiblePurchased.length > 0 && (
        <div className="flex items-center gap-2.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-2xl px-4 py-3">
          <span className="text-xl shrink-0">✅</span>
          <p className="text-sm text-green-800 dark:text-green-200 leading-snug">
            <strong>Ya está en tu carrito.</strong> Lo encontrarás abajo en «Comprados».
          </p>
        </div>
      )}
      {searching && visiblePending.length === 0 && visiblePurchased.length === 0 && (
        <div className="text-center py-8 px-4 bg-white dark:bg-stone-900 rounded-2xl border border-dashed border-stone-200 dark:border-stone-700">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">No está en la lista de hoy</p>
          {search.trim() && (
            <motion.button
              type="button"
              onClick={() => setShowAddSheet(true)}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className="animate-glow mt-4 w-full flex flex-col items-center gap-1 px-5 py-4 rounded-2xl bg-linear-to-r from-market-500 to-emerald-600 hover:from-market-600 hover:to-emerald-700 text-white shadow-xl shadow-market-500/40 transition"
            >
              <span className="flex items-center gap-2 text-base font-black">
                <span className="text-xl" aria-hidden="true">🔎➕</span>
                Buscar «{search.trim()}» en tu despensa
              </span>
              <span className="text-xs font-semibold opacity-90">y agregarlo a la lista de hoy</span>
            </motion.button>
          )}
          <p className="mt-3">
            <button
              type="button"
              onClick={() => { setSearch(''); setFilter('all'); setCategoryFilter(null); }}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition"
            >
              Limpiar filtros
            </button>
          </p>
        </div>
      )}

      {/* ─── Por comprar (card grid, pantry-style) ───────────────────────────── */}
      {visiblePending.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide">
              🛒 Por comprar
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              {visiblePending.length} {pluralize(visiblePending.length, 'producto', 'productos')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visiblePending.map((item) => (
              <ProductPurchaseCard
                key={item.id}
                item={item}
                inCart={false}
                lineTotal={entriesTotal(entries[item.product.id])}
                lineQty={entriesQty(entries[item.product.id], Math.max(1, item.quantityNeeded))}
                onOpen={() => setEditorItemId(item.id)}
                onZoom={(src, origin) => setZoomItem({ src, alt: item.product.name, origin })}
              />
            ))}
          </div>
        </section>
      )}

      {notInCart.length === 0 && inCart.length > 0 && !searching && (
        <div className="text-center py-8 bg-market-50/60 dark:bg-market-900/20 rounded-2xl border border-market-200 dark:border-market-800">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-semibold text-market-700 dark:text-market-300">¡Todo está en el carrito!</p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Toca «Finalizar compra» abajo para registrarla
          </p>
        </div>
      )}

      {/* ─── Comprados (recency-ordered card grid) ───────────────────────────── */}
      {visiblePurchased.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide">
              ✔️ Comprados
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              {runningTotal > 0
                ? `${visiblePurchased.length} · ${hasEstimated ? '≈' : ''}$${runningTotal.toFixed(2)}`
                : `${visiblePurchased.length} ${pluralize(visiblePurchased.length, 'producto', 'productos')}`}
            </span>
          </div>
          <p className="text-[11px] text-stone-400 dark:text-stone-500 px-1 mb-2">
            El último que agarraste aparece primero · toca 💵 para ponerle precio
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {visiblePurchased.map((item) => (
              <ProductPurchaseCard
                key={item.id}
                item={item}
                inCart
                lineTotal={entriesTotal(entries[item.product.id])}
                lineQty={entriesQty(entries[item.product.id], Math.max(1, item.quantityNeeded))}
                onOpen={() => setEditorItemId(item.id)}
                onZoom={(src, origin) => setZoomItem({ src, alt: item.product.name, origin })}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Floating complete button ────────────────────────────────────────── */}
      {inCart.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-40 md:left-auto md:right-8 md:w-96 pb-[env(safe-area-inset-bottom)]">
          <motion.button
            onClick={openModal}
            disabled={completing}
            className={`w-full bg-linear-to-r from-market-500 to-market-700 hover:from-market-600 hover:to-market-800 text-white font-bold py-4 rounded-2xl text-base transition-all shadow-xl shadow-market-500/30 disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2${notInCart.length === 0 ? ' animate-glow' : ''}`}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          >
            {completing ? (
              'Procesando...'
            ) : (
              <>
                <ShoppingCartIcon className="w-5 h-5" />
                {runningTotal > 0
                  ? `Finalizar · $${runningTotal.toFixed(2)} · ${inCart.length} ${pluralize(inCart.length, 'item', 'items')}`
                  : `Finalizar compra · ${inCart.length} ${pluralize(inCart.length, 'item', 'items')}`}
              </>
            )}
          </motion.button>
        </div>
      )}

      {/* ─── Price editor bottom sheet ───────────────────────────────────────── */}
      {editorItem && (
        <PriceEditorSheet
          item={editorItem}
          entries={getEntriesFor(editorItem)}
          onChange={(updater) => updateEntries(editorItem.product.id, updater, editorItem)}
          onScan={(index) => setScanTarget({ productId: editorItem.product.id, index })}
          onRemoveFromList={!editorItem.isInCart ? () => setRemoveTarget(editorItem) : undefined}
          onMarkBought={!editorItem.isInCart ? () => { toggleItem(editorItem.id); } : undefined}
          onReturnToPending={editorItem.isInCart ? () => { toggleItem(editorItem.id); } : undefined}
          onZoom={(src, origin) => setZoomItem({ src, alt: editorItem.product.name, origin })}
          onClose={() => setEditorItemId(null)}
        />
      )}

      {/* ─── Price scanner (fills one entry's total) ─────────────────────────── */}
      {scanTarget && (
        <PriceScannerModal
          productName={items.find((i) => i.product.id === scanTarget.productId)?.product.name ?? ''}
          onPrice={(price) => {
            const item = items.find((i) => i.product.id === scanTarget.productId);
            if (item) {
              updateEntries(scanTarget.productId, (prev) =>
                prev.map((e, idx) => {
                  if (idx !== scanTarget.index) return e;
                  // In lb mode the sticker price is per pound; otherwise it's
                  // the batch total.
                  return e.mode === 'lb' ? { ...e, unitPrice: price } : { ...e, total: price };
                }),
              item);
            }
            setScanTarget(null);
            haptic(20);
          }}
          onClose={() => setScanTarget(null)}
        />
      )}

      {/* ─── Add-product sheet ───────────────────────────────────────────────── */}
      {showAddSheet && (
        <AddProductSheet
          existingProductIds={new Set(items.map((i) => i.product.id))}
          initialQuery={search.trim()}
          onAdded={handleAdded}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {/* ─── Photo zoom lightbox ─────────────────────────────────────────────── */}
      {zoomItem && (
        <PhotoLightbox
          src={zoomItem.src}
          alt={zoomItem.alt}
          originRect={zoomItem.origin}
          onClose={() => setZoomItem(null)}
        />
      )}

      {/* ─── Remove-from-list confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={removeTarget !== null}
        title={`¿Quitar "${removeTarget?.product.name ?? ''}"?`}
        message="Se quitará de la lista de compras de hoy (por ejemplo si no lo encontraste en el súper). Seguirá en tu despensa como faltante."
        confirmLabel="Quitar de la lista"
        destructive
        busy={removing}
        onConfirm={performRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* ─── Completion modal ────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
            onClick={() => setShowModal(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowModal(false); }}
          />

          <div className="relative w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 max-h-[88dvh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">🛒 Finalizar compra</h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500 transition"
              >
                ✕
              </button>
            </div>

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
            {runningTotal > 0 && (
              <div className="flex items-center justify-between bg-market-50 border border-market-200 rounded-xl px-3 py-2 mb-3 mt-2">
                <span className="text-sm text-market-700 font-medium">
                  💰 Suma de tus precios ({pricedCount}/{inCart.length})
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

            <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">
              Resumen · toca un producto para ajustar
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-5 pr-1">
              {inCart.map((item) => {
                const list = getEntriesFor(item);
                const qty = entriesQty(list, Math.max(1, item.quantityNeeded));
                const lineTotal = entriesTotal(list);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEditorItemId(item.id)}
                    className="w-full text-left bg-stone-50 dark:bg-stone-800 rounded-xl px-3 py-2.5 border border-stone-100 dark:border-stone-700 hover:border-market-300 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate min-w-0">
                        {item.product.name}
                      </span>
                      <span className={`text-xs font-bold shrink-0 ${lineTotal > 0 ? 'text-market-700' : 'text-stone-400'}`}>
                        {lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : 'sin precio'}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      {fmtQty(qty)} {item.product.unit || 'unid.'}
                      {list.filter(entryHasPrice).length > 1 && (
                        <> · {list
                          .filter(entryHasPrice)
                          .map((e, i) => {
                            const name = e.label?.trim() || `#${i + 1}`;
                            const money = entryTotal(e).toFixed(2);
                            return e.mode === 'lb' ? `${name} ${fmtQty(e.qty)} lb $${money}` : `${name} $${money}`;
                          })
                          .join(' · ')}</>
                      )}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pb-[env(safe-area-inset-bottom)]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ProductPurchaseCard({
  item,
  inCart,
  lineTotal,
  lineQty,
  onOpen,
  onZoom,
}: {
  readonly item: ShoppingListItem;
  readonly inCart: boolean;
  readonly lineTotal: number;
  readonly lineQty: number;
  /** Tapping anywhere on the card opens the product's action sheet. */
  readonly onOpen: () => void;
  readonly onZoom: (src: string, origin?: DOMRect) => void;
}) {
  const product = item.product;
  const urgent = !inCart && product.stockLevel === 'empty';
  const photoRef = useRef<HTMLButtonElement>(null);

  let borderCls = 'border-stone-100 dark:border-stone-800';
  if (inCart) borderCls = 'border-market-300 ring-2 ring-market-200/70 dark:border-market-700 dark:ring-market-900';
  else if (urgent) borderCls = 'border-rose-300 ring-1 ring-rose-200 dark:border-rose-800';

  return (
    <div className={`group relative bg-white dark:bg-stone-900 rounded-2xl border shadow-md transition-all duration-200 flex flex-col overflow-hidden ${borderCls}`}>
      {/* Whole card = one tap target that opens the action sheet. Nothing
          happens by accident: buying, pricing and removing live in the sheet. */}
      <button
        ref={photoRef}
        type="button"
        aria-label={`Opciones de ${product.name}`}
        onClick={onOpen}
        className="w-full text-left focus:outline-none flex-1 flex flex-col"
      >
        <span className="relative aspect-4/3 bg-stone-50 dark:bg-stone-800 w-full overflow-hidden block">
          {product.photoUrl ? (
            <Image
              src={product.photoUrl}
              alt={product.name}
              fill
              className={`object-cover transition-all duration-300 ${inCart ? 'opacity-80' : ''}`}
              sizes="(max-width: 640px) 50vw, 25vw"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-4xl opacity-40 bg-linear-to-br from-sky-50 to-stone-100 dark:from-stone-800 dark:to-stone-900">
              {categoryEmoji(product.category)}
            </span>
          )}

          {/* Status badge */}
          {inCart ? (
            <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-market-500 text-white flex items-center justify-center text-sm font-bold shadow">
              ✓
            </span>
          ) : (
            <span
              className={`absolute top-2 right-2 text-[9px] font-bold tracking-wide uppercase px-2 py-1 rounded-full bg-white/95 backdrop-blur-sm shadow-sm ${
                urgent ? 'text-rose-600' : 'text-amber-600'
              }`}
            >
              {urgent ? '🚨 Urgente' : '⚠️ Bajo'}
            </span>
          )}

          {/* Line total captured so far */}
          {inCart && lineTotal > 0 && (
            <span className="absolute bottom-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-market-600 text-white shadow tabular-nums">
              ${lineTotal.toFixed(2)}
            </span>
          )}
        </span>

        {/* Info */}
        <span className="block p-2">
          <span className={`block font-semibold text-xs truncate ${inCart ? 'text-stone-400 line-through' : 'text-stone-800 dark:text-stone-100'}`}>
            {product.name}
          </span>
          {product.category && (
            <span className="block text-[10px] text-stone-400 uppercase tracking-wide mt-0.5 truncate">{product.category}</span>
          )}
          <span className="block text-[10px] text-stone-400 mt-0.5 tabular-nums">
            {fmtQty(lineQty)} {product.unit || 'unid.'}
            {!inCart && product.lastPurchasePrice != null && ` · últ. $${product.lastPurchasePrice.toFixed(2)}`}
          </span>
          <span className={`mt-1.5 mb-0.5 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold ${
            inCart
              ? 'bg-market-50 text-market-700 dark:bg-market-900/30 dark:text-market-300'
              : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
          }`}>
            {inCart ? '✓ Comprado · toca para opciones' : 'Toca para comprar / precio'}
          </span>
        </span>
      </button>

      {/* Zoom — its own sibling tap target on top of the photo */}
      {product.photoUrl && (
        <button
          type="button"
          aria-label={`Ver foto de ${product.name}`}
          onClick={() => onZoom(product.photoUrl!, photoRef.current?.getBoundingClientRect())}
          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center text-sm shadow focus:outline-none active:scale-90 transition"
        >
          🔍
        </button>
      )}
    </div>
  );
}

// ─── Price editor bottom sheet ────────────────────────────────────────────────

function PriceEditorSheet({
  item,
  entries,
  onChange,
  onScan,
  onRemoveFromList,
  onMarkBought,
  onReturnToPending,
  onZoom,
  onClose,
}: {
  readonly item: ShoppingListItem;
  readonly entries: PriceEntry[];
  readonly onChange: (updater: (prev: PriceEntry[]) => PriceEntry[]) => void;
  readonly onScan: (index: number) => void;
  readonly onRemoveFromList?: () => void;
  readonly onMarkBought?: () => void;
  readonly onReturnToPending?: () => void;
  readonly onZoom: (src: string, origin?: DOMRect) => void;
  readonly onClose: () => void;
}) {
  const sheetPhotoRef = useRef<HTMLButtonElement>(null);
  const product = item.product;
  const byWeight = isWeightUnit(product.unit);
  const unitLabel = product.unit || 'unid.';
  const totalQty = entriesQty(entries, 0);
  const lineTotal = entriesTotal(entries);
  const qtyStep = byWeight ? 0.25 : 1;

  function setEntry(index: number, patch: Partial<PriceEntry>) {
    onChange((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function addEntry() {
    haptic(8);
    onChange((prev) => [...prev, { qty: byWeight ? 1 : 1, total: null }]);
  }

  function removeEntry(index: number) {
    haptic(8);
    onChange((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      />

      <div className="relative w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 max-h-[88dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            ref={sheetPhotoRef}
            type="button"
            aria-label={product.photoUrl ? `Ver foto de ${product.name}` : undefined}
            disabled={!product.photoUrl}
            onClick={() => product.photoUrl && onZoom(product.photoUrl, sheetPhotoRef.current?.getBoundingClientRect())}
            className="w-14 h-14 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 relative focus:outline-none active:scale-95 transition"
          >
            {product.photoUrl ? (
              <>
                <Image src={product.photoUrl} alt={product.name} fill className="object-cover" sizes="56px" />
                <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/45 text-white text-[9px] flex items-center justify-center">🔍</span>
              </>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xl">
                {categoryEmoji(product.category)}
              </span>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-stone-800 dark:text-stone-100 truncate">{product.name}</h2>
            <p className="text-[11px] text-stone-400">
              {byWeight ? `Se vende por peso (${unitLabel})` : `Se vende por ${unitLabel}`}
              {product.lastPurchasePrice != null && ` · última vez $${product.lastPurchasePrice.toFixed(2)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500 transition shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Hint */}
        <div className="flex items-start gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl px-3 py-2 mb-3">
          <span className="text-sm shrink-0">💡</span>
          <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-snug">
            {byWeight
              ? `Pesa y anota lo que dice la balanza: cuántas ${unitLabel} y cuánto costó ese paquete. Si llevas varios paquetes, agrega una línea por cada uno.`
              : 'Cada línea es un empaque con su precio. ¿Dos bandejas de carne, o un aceite grande y uno pequeño con precios distintos? Agrega una línea para cada uno y ponle una nota para distinguirlos.'}
          </p>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
          {entries.map((entry, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="bg-stone-50 dark:bg-stone-800 rounded-xl px-3 py-2.5 border border-stone-100 dark:border-stone-700">
              <div className="flex items-center justify-between mb-2 gap-2">
                {entries.length > 1 ? (
                  <input
                    type="text"
                    aria-label={`Nota del empaque ${index + 1}`}
                    value={entry.label ?? ''}
                    placeholder={`${byWeight ? 'Paquete' : 'Empaque'} ${index + 1} · nota (ej. grande)`}
                    maxLength={30}
                    onChange={(e) => setEntry(index, { label: e.target.value })}
                    className="flex-1 min-w-0 text-[11px] font-bold text-stone-600 dark:text-stone-300 uppercase tracking-wide bg-transparent border-b border-dashed border-stone-200 dark:border-stone-700 focus:outline-none focus:border-market-400 placeholder:normal-case placeholder:font-normal placeholder:text-stone-400 pb-0.5"
                  />
                ) : (
                  <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wide">
                    Cantidad y precio
                  </span>
                )}
                {entries.length > 1 && (
                  <button
                    type="button"
                    aria-label="Quitar esta línea"
                    onClick={() => removeEntry(index)}
                    className="text-[11px] text-stone-400 hover:text-rose-500 transition font-semibold"
                  >
                    ✕ quitar
                  </button>
                )}
              </div>
              {(() => {
                const mode: 'unit' | 'lb' = entry.mode ?? (byWeight ? 'lb' : 'unit');
                const step = mode === 'lb' ? 0.25 : 1;
                const qtyLabel = mode === 'lb' ? 'lb' : unitLabel;
                const computed = entryTotal(entry);
                return (
                  <>
                    {/* Mode toggle: sold by unit or by the pound */}
                    <div className="flex gap-1.5 mb-2">
                      <button
                        type="button"
                        aria-pressed={mode === 'unit'}
                        onClick={() => setEntry(index, { mode: 'unit' })}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition active:scale-95 ${
                          mode === 'unit'
                            ? 'bg-market-600 text-white shadow-sm'
                            : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-500'
                        }`}
                      >
                        📦 Por unidad
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === 'lb'}
                        onClick={() => setEntry(index, { mode: 'lb' })}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition active:scale-95 ${
                          mode === 'lb'
                            ? 'bg-market-600 text-white shadow-sm'
                            : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-500'
                        }`}
                      >
                        ⚖️ Por libra
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Quantity (units or pounds) */}
                      <div className="flex items-center gap-0.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-0.5">
                        <button
                          type="button"
                          aria-label="Menos"
                          onClick={() => setEntry(index, { qty: Math.max(step, Math.round((entry.qty - step) * 100) / 100) })}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-90 transition text-lg font-bold"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          aria-label={`Cantidad (${qtyLabel})`}
                          value={entry.qty === 0 ? '' : entry.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const n = e.target.value === '' ? 0 : Number(e.target.value);
                            if (Number.isFinite(n) && n >= 0) setEntry(index, { qty: n });
                          }}
                          className="w-12 text-center text-sm font-bold text-stone-800 dark:text-stone-100 bg-transparent focus:outline-none tabular-nums"
                        />
                        <button
                          type="button"
                          aria-label="Más"
                          onClick={() => setEntry(index, { qty: Math.round((entry.qty + step) * 100) / 100 })}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-90 transition text-lg font-bold"
                        >
                          ＋
                        </button>
                        <span className="text-[10px] text-stone-400 pr-1.5">{qtyLabel}</span>
                      </div>

                      {/* Price: batch total (unit) or price per pound (lb) */}
                      <div className="relative flex-1 min-w-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">$</span>
                        {mode === 'lb' ? (
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            aria-label="Precio por libra"
                            value={entry.unitPrice ?? ''}
                            placeholder="precio/lb"
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') { setEntry(index, { unitPrice: null }); return; }
                              const n = Number(raw);
                              if (Number.isFinite(n) && n >= 0) setEntry(index, { unitPrice: n });
                            }}
                            className="w-full pl-6 pr-2 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-bold text-stone-800 dark:text-stone-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-market-300 transition"
                          />
                        ) : (
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            aria-label="Precio de este paquete"
                            value={entry.total ?? ''}
                            placeholder="0.00"
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === '') { setEntry(index, { total: null }); return; }
                              const n = Number(raw);
                              if (Number.isFinite(n) && n >= 0) setEntry(index, { total: n });
                            }}
                            className="w-full pl-6 pr-2 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm font-bold text-stone-800 dark:text-stone-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-market-300 transition"
                          />
                        )}
                      </div>

                      {/* Scan */}
                      <button
                        type="button"
                        aria-label="Escanear precio con la cámara"
                        onClick={() => onScan(index)}
                        className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-market-300 transition active:scale-95 text-base"
                      >
                        📷
                      </button>
                    </div>

                    {/* The app does the math: lbs × $/lb */}
                    {mode === 'lb' && (
                      <p className="mt-1.5 text-[11px] font-semibold text-market-700 dark:text-market-300 tabular-nums">
                        {entry.unitPrice != null && entry.qty > 0
                          ? `${fmtQty(entry.qty)} lb × $${entry.unitPrice.toFixed(2)}/lb = $${computed.toFixed(2)}`
                          : 'Pon las libras y el precio por libra — la app calcula el total.'}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          ))}

          <button
            type="button"
            onClick={addEntry}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 text-xs font-bold hover:border-market-300 hover:text-market-600 transition active:scale-[0.99]"
          >
            ＋ Agregar otro {byWeight ? 'paquete pesado' : 'empaque con distinto precio'}
          </button>
        </div>

        {/* Running line summary */}
        <div className="flex items-center justify-between bg-market-50 dark:bg-market-900/20 border border-market-200 dark:border-market-800 rounded-xl px-3 py-2 mb-3">
          <span className="text-sm text-market-700 dark:text-market-300 font-medium">
            {fmtQty(totalQty)} {unitLabel} en total
          </span>
          <span className="font-bold text-market-700 dark:text-market-300 tabular-nums">
            {lineTotal > 0 ? `$${lineTotal.toFixed(2)}` : 'sin precio'}
          </span>
        </div>

        {/* Actions */}
        <div className="space-y-2 pb-[env(safe-area-inset-bottom)]">
          {onMarkBought && (
            <button
              type="button"
              onClick={() => { onMarkBought(); onClose(); }}
              className="w-full py-3 rounded-2xl bg-market-600 hover:bg-market-700 text-white font-bold text-sm transition active:scale-[0.98]"
            >
              🛒 Marcar como comprado
            </button>
          )}
          {onReturnToPending && (
            <button
              type="button"
              onClick={() => { onReturnToPending(); onClose(); }}
              className="w-full py-3 rounded-2xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 font-semibold text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition active:scale-[0.98]"
            >
              ↩ Devolver a «Por comprar»
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 font-semibold text-sm hover:bg-stone-50 dark:hover:bg-stone-800 transition"
          >
            ✓ Listo
          </button>
          {onRemoveFromList && (
            <button
              type="button"
              onClick={onRemoveFromList}
              className="w-full py-2.5 rounded-2xl text-rose-500 font-semibold text-xs hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
            >
              🚫 No estaba en el súper — quitar de la lista
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add-product bottom sheet ─────────────────────────────────────────────────

interface PantryPick {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly category: string | null;
  readonly stockLevel: 'full' | 'half' | 'empty';
  readonly unit: string;
  readonly lastPurchasePrice: number | null;
}

/**
 * Lets the user pull any pantry product into today's shopping list without
 * leaving the store — e.g. something removed by mistake, or an extra item
 * they decided to buy on the spot.
 */
function AddProductSheet({
  existingProductIds,
  initialQuery,
  onAdded,
  onClose,
}: {
  readonly existingProductIds: ReadonlySet<string>;
  readonly initialQuery?: string;
  readonly onAdded: (item: ShoppingListItem) => void;
  readonly onClose: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<PantryPick[]>([]);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/proxy/products', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error('fetch failed');
        const rows = (await res.json()) as Record<string, unknown>[];
        if (cancelled) return;
        setProducts(rows.map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ''),
          photoUrl: (r.photo_url as string | null) ?? null,
          category: (r.category as string | null) ?? null,
          stockLevel: (r.stock_level as 'full' | 'half' | 'empty') ?? 'full',
          unit: String(r.unit ?? ''),
          lastPurchasePrice: r.last_purchase_price == null ? null : Number(r.last_purchase_price),
        })));
      } catch {
        if (!cancelled) toast.show('No se pudieron cargar tus productos.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = normalizeText(query.trim());
    const pool = products.filter((p) => !existingProductIds.has(p.id));
    const filtered = q
      ? pool.filter((p) => textMatches(p.name, q) || textMatches(p.category ?? '', q))
      : pool;
    // Faltantes primero (lo más probable que quieras re-agregar), luego A-Z.
    return [...filtered].sort((a, b) => {
      const rank = (lvl: PantryPick['stockLevel']) => (lvl === 'empty' ? 0 : lvl === 'half' ? 1 : 2);
      const ra = rank(a.stockLevel);
      const rb = rank(b.stockLevel);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [products, query, existingProductIds]);

  async function addProduct(p: PantryPick) {
    if (addingId) return;
    setAddingId(p.id);
    try {
      const res = await fetch('/api/proxy/shopping-list', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: p.id }),
      });
      if (!res.ok) throw new Error('add failed');
      const row = (await res.json()) as Record<string, unknown>;
      const now = new Date().toISOString();
      onAdded({
        id: String(row.id),
        productId: p.id,
        quantityNeeded: 1,
        isInCart: false,
        isPurchased: false,
        userId: '',
        createdAt: now,
        updatedAt: now,
        product: {
          id: p.id,
          name: p.name,
          description: null,
          photoUrl: p.photoUrl,
          category: p.category,
          currentQuantity: 0,
          minQuantity: 0,
          unit: p.unit,
          // Adding to the list marks the product as needed server-side, so a
          // fully-stocked pick shows as "half" locally to match.
          stockLevel: p.stockLevel === 'full' ? 'half' : p.stockLevel,
          isRunningLow: true,
          needsShopping: true,
          status: 'low',
          userId: '',
          createdAt: now,
          updatedAt: now,
          lastPurchasePrice: p.lastPurchasePrice,
          lastPurchaseDate: null,
          avgPrice: null,
          totalSpent: 0,
          totalPurchasedQty: 0,
          currency: 'USD',
        },
      });
      onClose();
    } catch {
      toast.show('No se pudo agregar. Intenta de nuevo.', 'error');
    } finally {
      setAddingId(null);
    }
  }

  function stockBadge(level: PantryPick['stockLevel']) {
    if (level === 'empty') return <span className="text-[9px] font-bold uppercase text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full shrink-0">🚨 Se acabó</span>;
    if (level === 'half') return <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">⚠️ Bajo</span>;
    return <span className="text-[9px] font-bold uppercase text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full shrink-0">✅ Tengo</span>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      />

      <div className="relative w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 h-[80dvh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">➕ Agregar a la lista</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500 transition"
          >
            ✕
          </button>
        </div>

        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none select-none">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca en tu despensa…"
            aria-label="Buscar en tu despensa"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pb-[env(safe-area-inset-bottom)]">
          {loading && (
            <p className="text-center text-sm text-stone-400 py-10">Cargando tu despensa…</p>
          )}
          {!loading && visible.length === 0 && (
            <p className="text-center text-sm text-stone-400 py-10">
              {query ? 'Nada coincide con tu búsqueda.' : 'Todos tus productos ya están en la lista.'}
            </p>
          )}
          {visible.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={addingId !== null}
              onClick={() => addProduct(p)}
              className="w-full flex items-center gap-3 p-2 rounded-xl border border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-market-300 hover:bg-market-50/40 dark:hover:bg-stone-800/60 transition text-left disabled:opacity-60"
            >
              <span className="w-11 h-11 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 relative">
                {p.photoUrl ? (
                  <Image src={p.photoUrl} alt={p.name} fill className="object-cover" sizes="44px" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-lg opacity-50">
                    {categoryEmoji(p.category)}
                  </span>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-stone-800 dark:text-stone-100 truncate">{p.name}</span>
                {p.category && (
                  <span className="block text-[10px] text-stone-400 uppercase tracking-wide truncate">{p.category}</span>
                )}
              </span>
              {stockBadge(p.stockLevel)}
              <span className="shrink-0 w-8 h-8 rounded-full bg-market-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                {addingId === p.id ? '…' : '＋'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
