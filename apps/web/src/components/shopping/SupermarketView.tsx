'use client';

import { useMemo, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import type { ShoppingListItem } from '@foody/types';
import { haptic } from '@/lib/haptic';

interface Props {
  readonly initialItems: ShoppingListItem[];
  readonly pastStoreNames?: readonly string[];
}

type Filter = 'all' | 'urgent' | 'low';

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function getRowCls(inCart: boolean, urgent: boolean): string {
  if (inCart) return 'bg-market-50/60 border-market-200';
  if (urgent) return 'bg-white border-rose-200 hover:border-rose-300 hover:bg-rose-50/40';
  return 'bg-white border-stone-100 hover:border-market-300 hover:bg-market-50/40';
}

function getCheckboxCls(inCart: boolean, urgent: boolean): string {
  if (inCart) return 'border-market-500 bg-market-500 scale-105';
  if (urgent) return 'border-rose-300';
  return 'border-stone-300';
}

export default function SupermarketView({ initialItems, pastStoreNames }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [completing, setCompleting] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [searchFocused, setSearchFocused] = useState(false);

  const { inCart, notInCart, urgent, low } = useMemo(() => {
    const inCart = items.filter((i) => i.isInCart);
    const notInCart = items.filter((i) => !i.isInCart);
    const urgent = notInCart.filter((i) => i.product.stockLevel === 'empty');
    const low = notInCart.filter((i) => i.product.stockLevel !== 'empty');
    return { inCart, notInCart, urgent, low };
  }, [items]);

  const progress = items.length === 0 ? 0 : (inCart.length / items.length) * 100;

  function replaceItem(id: string, updated: ShoppingListItem) {
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  function optimisticToggle(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isInCart: !i.isInCart } : i)),
    );
  }

  async function fetchToggle(id: string) {
    const res = await fetch(
      `/api/proxy/shopping-list/${id}/toggle-cart`,
      { method: 'PATCH', credentials: 'include' },
    );
    if (res.ok) {
      const updated: ShoppingListItem = await res.json();
      replaceItem(id, updated);
    }
  }

  function toggleItem(id: string) {
    haptic(12);
    optimisticToggle(id);
    startTransition(() => {
      void fetchToggle(id);
    });
  }

  function openModal() {
    if (inCart.length === 0) return;
    const initQty: Record<string, number> = {};
    for (const item of inCart) {
      initQty[item.product.id] = item.quantityNeeded > 0 ? item.quantityNeeded : 1;
    }
    setQuantities(initQty);
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

    const res = await fetch('/api/shopping-list/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: storeName.trim() || undefined,
        quantities,
      }),
    });

    if (res.ok) {
      setShowModal(false);
      setStoreName('');
      setQuantities({});
      setItems((prev) => prev.filter((i) => !i.isInCart));
      router.refresh();
    }
    setCompleting(false);
  }

  function applyFilter(list: ShoppingListItem[]) {
    const q = search.trim().toLowerCase();
    return list.filter((i) => {
      if (q && !i.product.name.toLowerCase().includes(q)) return false;
      if (filter === 'urgent') return i.product.stockLevel === 'empty';
      if (filter === 'low') return i.product.stockLevel === 'half';
      return true;
    });
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-6xl mb-4">🎉</p>
        <h2 className="text-xl font-semibold text-stone-600 mb-2">¡Lista vacía!</h2>
        <p className="text-stone-400">
          No tienes productos marcados para comprar.
        </p>
        <a href="/home" className="mt-4 inline-block text-brand-500 hover:underline">
          Volver a casa
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32">
      {/* ─── Progress ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border border-stone-100 shadow-sm">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-semibold text-stone-700">
            {inCart.length} / {items.length} en el carrito
          </span>
          <span className="text-xs text-stone-400">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-market-400 to-market-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
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
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
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
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === k
                  ? 'bg-market-600 text-white shadow-sm'
                  : 'bg-white border border-stone-200 text-stone-600 hover:border-market-300'
              }`}
              whileHover={{ scale: 1.07 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              {label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* ─── Urgent (empty) ─────────────────────────────────────────────────── */}
      {applyFilter(urgent).length > 0 && (
        <Section
          title="Se acabó — prioridad alta"
          subtitle={`${applyFilter(urgent).length} productos`}
          badgeCls="bg-rose-100 text-rose-700"
        >
          {applyFilter(urgent).map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => toggleItem(item.id)}
              disabled={isPending}
              urgent
            />
          ))}
        </Section>
      )}

      {/* ─── Low (half) ─────────────────────────────────────────────────────── */}
      {applyFilter(low).length > 0 && (
        <Section
          title="Queda poco"
          subtitle={`${applyFilter(low).length} productos`}
          badgeCls="bg-amber-100 text-amber-700"
        >
          {applyFilter(low).map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => toggleItem(item.id)}
              disabled={isPending}
            />
          ))}
        </Section>
      )}

      {/* ─── In cart ────────────────────────────────────────────────────────── */}
      {inCart.length > 0 && (
        <Section
          title="En el carrito"
          subtitle={`${inCart.length} ${pluralize(inCart.length, 'listo', 'listos')}`}
          badgeCls="bg-market-100 text-market-700"
        >
          {inCart.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => toggleItem(item.id)}
              disabled={isPending}
              inCart
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
            className="w-full bg-linear-to-r from-market-500 to-market-700 hover:from-market-600 hover:to-market-800 text-white font-bold py-4 rounded-2xl text-base transition-all shadow-xl shadow-market-500/30 disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
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
                {`Finalizar compra · ${inCart.length} ${pluralize(inCart.length, 'item', 'items')}`}
              </>
            )}
          </motion.button>
        </div>
      )}

      {/* ─── Completion modal ───────────────────────────────────────────────── */}
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
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 max-h-[88dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-800">🛒 Finalizar compra</h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 transition"
              >
                ✕
              </button>
            </div>

            {/* Store name */}
            <label
              htmlFor="modal-store-name"
              className="block text-sm font-semibold text-stone-700 mb-1.5"
            >
              ¿En qué supermercado compraste?
            </label>
            <input
              id="modal-store-name"
              list="store-suggestions"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Ej. Walmart, Soriana, HEB…"
              className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition mb-4"
            />
            {pastStoreNames && pastStoreNames.length > 0 && (
              <datalist id="store-suggestions">
                {pastStoreNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}

            {/* Quantities */}
            <p className="text-sm font-semibold text-stone-700 mb-2">
              Cantidad comprada
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-5 pr-1">
              {inCart.map((item) => {
                const qty = quantities[item.product.id] ?? item.quantityNeeded;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 border border-stone-100"
                  >
                    <span className="flex-1 text-sm font-medium text-stone-700 truncate min-w-0">
                      {item.product.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
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
                        className="w-16 text-center text-sm font-bold text-stone-800 bg-white border border-stone-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
                      />
                      {item.product.unit && (
                        <span className="text-xs text-stone-400">{item.product.unit}</span>
                      )}
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
                className="flex-1 py-3 rounded-2xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition"
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
        <h2 className="text-sm font-bold text-stone-700 uppercase tracking-wide">
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
}: {
  readonly item: ShoppingListItem;
  readonly onToggle: () => void;
  readonly disabled: boolean;
  readonly inCart?: boolean;
  readonly urgent?: boolean;
}) {
  const product = item.product;
  const rowCls = getRowCls(inCart, urgent);
  const checkboxCls = getCheckboxCls(inCart, urgent);

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left active:scale-[0.98] ${rowCls} disabled:opacity-60`}
    >
      {/* Checkbox */}
      <div
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${checkboxCls}`}
      >
        {inCart && <span className="text-white text-xs font-bold">✓</span>}
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
              inCart ? 'line-through text-stone-400' : 'text-stone-800'
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

      {/* Quantity / undo */}
      {inCart ? (
        <span className="shrink-0 text-[11px] font-semibold text-market-600 bg-market-50 border border-market-200 px-2 py-0.5 rounded-full">
          Quitar ↩
        </span>
      ) : (
        <span className="text-xs text-stone-500 shrink-0 font-medium">
          {item.quantityNeeded} {product.unit}
        </span>
      )}
    </button>
  );
}
