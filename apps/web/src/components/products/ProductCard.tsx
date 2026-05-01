'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Product, StockLevel } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { useSwipe } from '@/lib/useSwipe';
import ActionSheet from '@/components/ui/ActionSheet';
import ProductDetailSheet from '@/components/ui/ProductDetailSheet';

interface LastPurchase {
  readonly purchasedAt: string;
  readonly storeName: string | null;
}

function ProductPhoto({ src, alt }: { readonly src: string; readonly alt: string }) {
  if (src.startsWith('data:')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:opacity-90" />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:opacity-90"
      sizes="(max-width: 640px) 50vw, 25vw"
    />
  );
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

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (hours < 1) return 'hace menos de 1 h';
  if (hours < 24) return `hace ${hours} h`;
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.floor(days / 7)} sem.`;
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export default function ProductCard({ product, showActions = false, compact = false, onLevelChange, lastPurchase }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(product);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

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

  async function handleDelete() {
    if (!globalThis.window.confirm(`¿Eliminar "${current.name}"?`)) return;
    await fetch(`/api/proxy/products/${current.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    router.refresh();
  }

  const sharedCls = `group relative bg-white rounded-2xl border shadow-md transition-all duration-300 ease-out hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.02] touch-pan-y select-none ${borderCls}`;

  const photoSection = (
    <div className="aspect-4/3 bg-stone-50 relative overflow-hidden rounded-t-2xl">
      {current.photoUrl ? (
        <ProductPhoto src={current.photoUrl} alt={current.name} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl opacity-40 bg-linear-to-br from-sky-50 to-stone-100">
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
    <div className="p-2">
      <p className="font-semibold text-stone-800 text-xs truncate">{current.name}</p>
      {current.category && (
        <p className="text-[10px] text-stone-400 uppercase tracking-wide mt-0.5 truncate">
          {current.category}
        </p>
      )}
      {current.lastPurchasePrice != null && (
        <p className="mt-0.5 text-sm font-bold text-stone-900 leading-none">
          {formatMoney(current.lastPurchasePrice, current.currency ?? 'MXN')}
        </p>
      )}
      {current.totalSpent > 0 && (
        <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
          <span className="text-stone-400">Total gastado</span>
          <span className="font-bold text-brand-700">{formatMoney(current.totalSpent, current.currency ?? 'MXN')}</span>
        </div>
      )}
      {lastPurchase && (
        <div className="mt-2 pt-2 border-t border-stone-100 text-[10px] text-stone-400">
          <p className="text-stone-500 font-semibold mb-0.5">Última compra</p>
          <p className="flex items-center gap-1">
            <span>🕐</span>
            <span>{formatRelativeTime(lastPurchase.purchasedAt)}</span>
          </p>
          {lastPurchase.storeName && (
            <p className="flex items-center gap-1 mt-0.5">
              <span>🏪</span>
              <span className="truncate">en {lastPurchase.storeName}</span>
            </p>
          )}
        </div>
      )}
      {showActions && (
        <div className="mt-2 pb-1 flex gap-1.5">
          <a
            href={`/products/${current.id}`}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl bg-stone-50 hover:bg-stone-100 active:bg-stone-200 text-stone-700 transition"
          >
            <span className="text-base leading-none">✏️</span>
            <span className="text-[11px] font-semibold">Editar</span>
          </a>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 transition"
          >
            <span className="text-base leading-none">🗑️</span>
            <span className="text-[11px] font-semibold">Eliminar</span>
          </button>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <>
        <button type="button" onClick={() => setDetailOpen(true)} className={`${sharedCls} w-full text-left cursor-pointer`}>
          {photoSection}
          {infoSection}
        </button>
        <ProductDetailSheet
          product={current}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          lastPurchase={lastPurchase}
        />
      </>
    );
  }

  return (
    <div {...swipe} className={sharedCls}>
      {/* ─── Photo ────────────────────────────────────────────────────── */}
      <div className="aspect-4/3 bg-stone-50 relative overflow-hidden rounded-t-2xl">
        {current.photoUrl ? (
          <button
            type="button"
            aria-label={`Ver foto de ${current.name}`}
            onClick={(e) => { e.stopPropagation(); setDetailOpen(true); }}
            className="absolute inset-0 w-full h-full focus:outline-none"
          >
            <ProductPhoto src={current.photoUrl} alt={current.name} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Options for ${current.name}`}
            onClick={() => setDetailOpen(true)}
            className="w-full h-full flex items-center justify-center text-3xl opacity-40 bg-linear-to-br from-sky-50 to-stone-100 focus:outline-none"
          >
            🥑
          </button>
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
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full text-left p-2 focus:outline-none"
      >
        <p className="font-semibold text-stone-800 text-xs truncate">{current.name}</p>
        {current.category && (
          <p className="text-[10px] text-stone-400 uppercase tracking-wide mt-0.5 truncate">
            {current.category}
          </p>
        )}
        {current.lastPurchasePrice != null && (
          <p className="mt-0.5 text-sm font-bold text-stone-900 leading-none">
            {formatMoney(current.lastPurchasePrice, current.currency ?? 'MXN')}
          </p>
        )}
        {current.totalSpent > 0 && (
          <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
            <span className="text-stone-400">Total gastado</span>
            <span className="font-bold text-brand-700">{formatMoney(current.totalSpent, current.currency ?? 'MXN')}</span>
          </div>
        )}
        {lastPurchase && (
          <div className="mt-2 pt-2 border-t border-stone-100 text-[10px] text-stone-400">
            <p className="text-stone-500 font-semibold mb-0.5">Última compra</p>
            <p className="flex items-center gap-1">
              <span>🕐</span>
              <span>{formatRelativeTime(lastPurchase.purchasedAt)}</span>
            </p>
            {lastPurchase.storeName && (
              <p className="flex items-center gap-1 mt-0.5">
                <span>🏪</span>
                <span className="truncate">en {lastPurchase.storeName}</span>
              </p>
            )}
          </div>
        )}
      </button>
      {showActions && (
        <div className="px-2 pb-3 flex gap-1.5">
          <a
            href={`/products/${current.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-stone-50 hover:bg-stone-100 active:bg-stone-200 text-stone-700 transition"
          >
            <span className="text-base leading-none">✏️</span>
            <span className="text-[11px] font-semibold">Editar</span>
          </a>
          <button
            type="button"
            onClick={handleDelete}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 transition"
          >
            <span className="text-base leading-none">🗑️</span>
            <span className="text-[11px] font-semibold">Eliminar</span>
          </button>
        </div>
      )}

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={current.name}
        actions={[
          { label: 'Marcar como "Tengo"', emoji: '✅', onClick: () => setLevel('full') },
          { label: 'Marcar como "A la mitad"', emoji: '⚠️', onClick: () => setLevel('half') },
          ...(level === 'empty' ? [] : [{ label: 'Marcar como "Se acabó"', emoji: '🚨', onClick: () => setLevel('empty') }]),
          { label: 'Eliminar producto', emoji: '🗑️', destructive: true, onClick: handleDelete },
        ]}
      />

      <ProductDetailSheet
        product={current}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        lastPurchase={lastPurchase}
      />
    </div>
  );
}
