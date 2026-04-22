'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Product, StockLevel } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { useSwipe } from '@/lib/useSwipe';
import { useLongPress } from '@/lib/useLongPress';
import ActionSheet from '@/components/ui/ActionSheet';
import RegisterPurchaseModal from './RegisterPurchaseModal';

interface Props {
  readonly product: Product;
  readonly showActions?: boolean;
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

export default function ProductCard({ product, showActions = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(product);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const level: StockLevel = current.stockLevel ?? (current.isRunningLow ? 'half' : 'full');
  const cfg = LEVEL_CONFIG[level];
  const [popKey, setPopKey] = useState(0);

  function setLevel(next: StockLevel) {
    if (next === level || isPending) return;

    haptic(next === 'empty' ? [15, 40, 20] : 10);

    // Optimistic update
    const previous = current;
    setCurrent({ ...current, stockLevel: next });
    setPopKey((k) => k + 1);

    startTransition(async () => {
      const res = await fetch(
        `/api/proxy/products/${current.id}/stock-level`,
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

  const swipe = useSwipe({
    onSwipeLeft: () => setLevel('empty'),
    onSwipeRight: () => setLevel('full'),
  });

  const longPress = useLongPress(() => setSheetOpen(true));

  async function handleDelete() {
    if (!globalThis.window.confirm(`¿Eliminar "${current.name}"?`)) return;
    await fetch(`/api/proxy/products/${current.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    router.refresh();
  }

  return (
    <div
      {...swipe}
      {...longPress.handlers}
      className={`group relative bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 touch-pan-y select-none ${borderCls}`}
    >
      {/* ─── Photo ───────────────────────────────────────────────────────── */}
      <div className="aspect-square bg-stone-50 relative overflow-hidden">
        {current.photoUrl ? (
          <Image
            src={current.photoUrl}
            alt={current.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-40">
            🥑
          </div>
        )}

        {/* Status badge */}
        <span className="absolute top-2 right-2 text-[10px] font-bold tracking-wide uppercase px-2 py-1 rounded-full flex items-center gap-1 bg-white/95 backdrop-blur-sm text-stone-700 shadow-sm">
          <span key={popKey} className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pop`} />
          {cfg.short}
        </span>

        {/* Empty overlay */}
        {level === 'empty' && (
          <div className="absolute inset-0 bg-linear-to-t from-rose-500/15 to-transparent pointer-events-none" />
        )}
      </div>

      {/* ─── Info ────────────────────────────────────────────────────────── */}
      <div className="p-3">
        <p className="font-semibold text-stone-800 text-sm truncate">{current.name}</p>
        {current.category && (
          <p className="text-xs text-stone-400 mt-0.5 truncate">{current.category}</p>
        )}

        {/* ─── 3-state segmented selector ─────────────────────────────────── */}
        <div
          role="radiogroup"
          aria-label="Estado del stock"
          className="mt-2.5 grid grid-cols-3 gap-1 p-1 bg-stone-50 rounded-xl"
        >
          {LEVEL_ORDER.map((l) => {
            const c = LEVEL_CONFIG[l];
            const active = l === level;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={c.label}
                title={c.label}
                onClick={() => setLevel(l)}
                disabled={isPending}
                className={`relative flex items-center justify-center text-xs font-semibold py-1.5 rounded-lg transition-all duration-200 disabled:cursor-not-allowed ${
                  active ? c.activeCls : `bg-transparent ${c.cls}`
                }`}
              >
                <span className="text-sm leading-none">{c.emoji}</span>
              </button>
            );
          })}
        </div>

        {/* Active-level label */}
        <p className="mt-1.5 text-[11px] text-stone-500 text-center">
          {cfg.label}
        </p>

        {/* ─── Purchase stats ────────────────────────────────────────────── */}
        {(current.lastPurchasePrice != null || current.totalSpent > 0) && (
          <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
            {current.lastPurchasePrice == null ? (
              <span className="text-stone-300">Sin compras</span>
            ) : (
              <span title="Último precio unitario">
                💲{formatMoney(current.lastPurchasePrice, current.currency ?? 'MXN')}
              </span>
            )}
            {current.totalSpent > 0 && (
              <span className="font-semibold text-brand-600" title="Total gastado">
                Σ {formatMoney(current.totalSpent, current.currency ?? 'MXN')}
              </span>
            )}
          </div>
        )}

        {/* ─── Quick purchase button ─────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => setPurchaseOpen(true)}
          className="mt-2 w-full py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold transition flex items-center justify-center gap-1"
        >
          🛒 Lo compré
        </button>

        {showActions && (
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            <a
              href={`/products/${current.id}`}
              className="py-1.5 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 text-[11px] font-semibold text-center transition"
            >
              ✏️ Editar
            </a>
            <button
              type="button"
              onClick={handleDelete}
              className="py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-semibold transition"
            >
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
          {
            label: 'Registrar compra con precio',
            emoji: '🛒',
            onClick: () => setPurchaseOpen(true),
          },
          {
            label: 'Marcar como "Tengo"',
            emoji: '✅',
            onClick: () => setLevel('full'),
          },
          {
            label: 'Marcar como "A la mitad"',
            emoji: '⚠️',
            onClick: () => setLevel('half'),
          },
          {
            label: 'Marcar como "Se acabó"',
            emoji: '🚨',
            onClick: () => setLevel('empty'),
          },
          {
            label: 'Eliminar producto',
            emoji: '🗑️',
            destructive: true,
            onClick: handleDelete,
          },
        ]}
      />

      <RegisterPurchaseModal
        open={purchaseOpen}
        product={current}
        onClose={() => setPurchaseOpen(false)}
        onSaved={(updated) => setCurrent(updated)}
      />
    </div>
  );
}
