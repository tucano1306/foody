'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Product, StockLevel } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { useSwipe } from '@/lib/useSwipe';
import { useLongPress } from '@/lib/useLongPress';
import ActionSheet from '@/components/ui/ActionSheet';
import PhotoLightbox from '@/components/ui/PhotoLightbox';

interface LastPurchase {
  readonly purchasedAt: string;
  readonly storeName: string | null;
}

interface Props {
  readonly product: Product;
  readonly showActions?: boolean;
  readonly compact?: boolean; // tap navigates to product page, hides stock buttons
  readonly onLevelChange?: (id: string, newLevel: StockLevel) => void;
  readonly lastPurchase?: LastPurchase;
}

const LEVEL_CONFIG: Record<
  StockLevel,
  { label: string; short: string; emoji: string; cls: string; activeCls: string; dot: string }
> = {
  full: {
    label: 'Tengo',
    short: 'OK',
    emoji: '✅',
    cls: 'text-emerald-600 hover:bg-emerald-50',
    activeCls: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  half: {
    label: 'A la mitad',
    short: 'Bajo',
    emoji: '⚠️',
    cls: 'text-amber-600 hover:bg-amber-50',
    activeCls: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30',
    dot: 'bg-amber-500',
  },
  empty: {
    label: 'Se acabó',
    short: 'Vacío',
    emoji: '🚨',
    cls: 'text-rose-600 hover:bg-rose-50',
    activeCls: 'bg-rose-500 text-white shadow-sm shadow-rose-500/30',
    dot: 'bg-rose-500',
  },
};

const LEVEL_ORDER: StockLevel[] = ['full', 'half', 'empty'];

function getBorderCls(level: StockLevel): string {
  if (level === 'empty') return 'border-rose-200 ring-1 ring-rose-100';
  if (level === 'half') return 'border-amber-200';
  return 'border-stone-100';
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function ProductCard({ product, showActions = false, compact = false, onLevelChange, lastPurchase }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(product);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const level: StockLevel = current.stockLevel ?? (current.isRunningLow ? 'half' : 'full');
  const cfg = LEVEL_CONFIG[level];
  const [popKey, setPopKey] = useState(0);

  function setLevel(next: StockLevel) {
    if (next === level || isPending) return;

    haptic(next === 'empty' ? [15, 40, 20] : 10);

    // Optimistic update — notify parent immediately so the section list updates at once
    const previous = current;
    const productId = current.id;
    setCurrent({ ...current, stockLevel: next });
    setPopKey((k) => k + 1);
    onLevelChange?.(productId, next);

    startTransition(async () => {
      const res = await fetch(
        `/api/proxy/products/${productId}/stock-level`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level: next }),
        },
      );

      if (res.ok) {
        const updated: Product = await res.json();
        setCurrent(updated);
        router.refresh();
      } else {
        setCurrent(previous);
      }
    });
  }

  const borderCls = getBorderCls(level);

  const swipe = useSwipe(
    compact ? {} : { onSwipeLeft: () => setLevel('empty'), onSwipeRight: () => setLevel('full') },
  );

  const longPress = useLongPress(() => setSheetOpen(true));

  async function handleDelete() {
    if (!globalThis.window.confirm(`¿Eliminar "${current.name}"?`)) return;
    await fetch(`/api/proxy/products/${current.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    router.refresh();
  }

  const sharedCls = `group relative bg-white rounded-2xl border shadow-md overflow-hidden transition-all duration-300 ease-out hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.02] touch-pan-y select-none ${borderCls}`;

  const photoSection = (
    <div className="aspect-square bg-stone-50 relative overflow-hidden">
      {current.photoUrl ? (
        <Image
          src={current.photoUrl}
          alt={current.name}
          fill
          className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:opacity-90"
          sizes="(max-width: 640px) 50vw, 25vw"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-5xl opacity-40 bg-linear-to-br from-sky-50 to-stone-100">
          🥑
        </div>
      )}
      <span className="absolute top-2 right-2 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full flex items-center gap-1 bg-white/95 backdrop-blur-sm text-stone-700 shadow-sm">
        <span key={popKey} className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pop`} />
        {cfg.short}
      </span>
      {level === 'empty' && (
        <div className="absolute inset-0 bg-linear-to-t from-rose-500/15 to-transparent pointer-events-none" />
      )}
    </div>
  );

  const infoSection = (
    <div className="p-3">
      <p className="font-semibold text-stone-800 text-sm truncate">{current.name}</p>
      {current.category && (
        <p className="text-[11px] text-stone-400 uppercase tracking-wide mt-0.5 truncate">
          {current.category}
        </p>
      )}
      {current.lastPurchasePrice != null && (
        <p className="mt-1 text-lg font-extrabold text-stone-900 leading-none">
          {formatMoney(current.lastPurchasePrice, current.currency ?? 'MXN')}
        </p>
      )}
      {!compact && (
        <>
          <div role="radiogroup" aria-label="Estado del stock" className="mt-2.5 grid grid-cols-3 gap-1 p-1 bg-stone-50 rounded-xl">
            {LEVEL_ORDER.map((l) => {
              const c = LEVEL_CONFIG[l];
              const active = l === level;
              return (
                <motion.button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setLevel(l)}
                  disabled={isPending}
                  className={['relative flex items-center justify-center text-xs font-semibold py-1.5 rounded-lg transition-all duration-200 disabled:cursor-not-allowed', active ? c.activeCls : `bg-transparent ${c.cls}`].join(' ')}
                  whileTap={{ scale: 0.75 }}
                  whileHover={active ? {} : { scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                >
                  <span className="text-sm leading-none">{c.emoji}</span>
                </motion.button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-stone-500 text-center">{cfg.label}</p>
        </>
      )}
      {current.totalSpent > 0 && (
        <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
          <span className="text-stone-400">Total gastado</span>
          <span className="font-bold text-brand-700">{formatMoney(current.totalSpent, current.currency ?? 'MXN')}</span>
        </div>
      )}
      {lastPurchase && (
        <div className="mt-2 pt-2 border-t border-stone-100 text-[10px] text-stone-400 space-y-0.5">
          <p className="flex items-center gap-1">
            <span>🕐</span>
            <span>{new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(lastPurchase.purchasedAt))}</span>
          </p>
          {lastPurchase.storeName && (
            <p className="flex items-center gap-1">
              <span>🏪</span>
              <span className="truncate">{lastPurchase.storeName}</span>
            </p>
          )}
        </div>
      )}
      {showActions && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          <a href={`/products/${current.id}`} className="py-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 text-[11px] font-semibold text-center transition">
            ✏️ Editar
          </a>
          <button type="button" onClick={handleDelete} className="py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-semibold transition">
            🗑️ Borrar
          </button>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <a href={`/products/${current.id}`} className={sharedCls}>
        {photoSection}
        {infoSection}
      </a>
    );
  }

  return (
    <div {...swipe} {...longPress.handlers} className={sharedCls}>
      {/* ─── Photo ───────────────────────────────────────────────────────── */}
      <div className="aspect-square bg-stone-50 relative overflow-hidden">
        {current.photoUrl ? (
          <button
            type="button"
            aria-label={`Ver foto de ${current.name}`}
            onClick={() => setLightboxOpen(true)}
            className="absolute inset-0 w-full h-full focus:outline-none"
          >
            <Image
              src={current.photoUrl}
              alt={current.name}
              fill
              className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:opacity-90"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
          </button>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-40 bg-linear-to-br from-sky-50 to-stone-100">
            🥑
          </div>
        )}
        <span className="absolute top-2 right-2 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full flex items-center gap-1 bg-white/95 backdrop-blur-sm text-stone-700 shadow-sm">
          <span key={popKey} className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pop`} />
          {cfg.short}
        </span>
        {level === 'empty' && (
          <div className="absolute inset-0 bg-linear-to-t from-rose-500/15 to-transparent pointer-events-none" />
        )}
      </div>

      {/* ─── Info ────────────────────────────────────────────────────────── */}
      <div className="p-3">
        <p className="font-semibold text-stone-800 text-sm truncate">{current.name}</p>
        {current.category && (
          <p className="text-[11px] text-stone-400 uppercase tracking-wide mt-0.5 truncate">
            {current.category}
          </p>
        )}
        {current.lastPurchasePrice != null && (
          <p className="mt-1 text-lg font-extrabold text-stone-900 leading-none">
            {formatMoney(current.lastPurchasePrice, current.currency ?? 'MXN')}
          </p>
        )}
        <div role="radiogroup" aria-label="Estado del stock" className="mt-2.5 grid grid-cols-3 gap-1 p-1 bg-stone-50 rounded-xl">
          {LEVEL_ORDER.map((l) => {
            const c = LEVEL_CONFIG[l];
            const active = l === level;
            return (
              <motion.button
                key={l}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={c.label}
                title={c.label}
                onClick={() => setLevel(l)}
                disabled={isPending}
                className={['relative flex items-center justify-center text-xs font-semibold py-1.5 rounded-lg transition-all duration-200 disabled:cursor-not-allowed', active ? c.activeCls : `bg-transparent ${c.cls}`].join(' ')}
                whileTap={{ scale: 0.75 }}
                whileHover={active ? {} : { scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              >
                <span className="text-sm leading-none">{c.emoji}</span>
              </motion.button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-stone-500 text-center">{cfg.label}</p>
        {current.totalSpent > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
            <span className="text-stone-400">Total gastado</span>
            <span className="font-bold text-brand-700">{formatMoney(current.totalSpent, current.currency ?? 'MXN')}</span>
          </div>
        )}
        {lastPurchase && (
          <div className="mt-2 pt-2 border-t border-stone-100 text-[10px] text-stone-400 space-y-0.5">
            <p className="flex items-center gap-1">
              <span>🕐</span>
              <span>{new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(lastPurchase.purchasedAt))}</span>
            </p>
            {lastPurchase.storeName && (
              <p className="flex items-center gap-1">
                <span>🏪</span>
                <span className="truncate">{lastPurchase.storeName}</span>
              </p>
            )}
          </div>
        )}
        {showActions && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            <a href={`/products/${current.id}`} className="py-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 text-[11px] font-semibold text-center transition">
              ✏️ Editar
            </a>
            <button type="button" onClick={handleDelete} className="py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-semibold transition">
              🗑️ Borrar
            </button>
          </div>
        )}
      </div>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={current.name}
        actions={[
          { label: 'Marcar como "Tengo"', emoji: '✅', onClick: () => setLevel('full') },
          { label: 'Marcar como "A la mitad"', emoji: '⚠️', onClick: () => setLevel('half') },
          { label: 'Marcar como "Se acabó"', emoji: '🚨', onClick: () => setLevel('empty') },
          { label: 'Eliminar producto', emoji: '🗑️', destructive: true, onClick: handleDelete },
        ]}
      />

      {lightboxOpen && current.photoUrl && (
        <PhotoLightbox src={current.photoUrl} alt={current.name} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
}
