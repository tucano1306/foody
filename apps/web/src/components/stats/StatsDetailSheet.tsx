'use client';

import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export type DetailType = 'stock' | 'store' | 'product' | 'month';

export interface ActiveDetail {
  type: DetailType;
  value: string;
  label: string;
}

interface Props {
  readonly open: boolean;
  readonly detail: ActiveDetail | null;
  readonly onClose: () => void;
}

// ─── Row shapes ──────────────────────────────────────────────────────────────

interface StockRow {
  id: string;
  name: string;
  category: string | null;
  current_quantity: string;
  unit: string;
  stock_level: string;
  last_purchase_price: string | null;
}

interface StoreRow {
  id: string;
  product_name: string;
  category: string | null;
  quantity: string;
  unit_price: string | null;
  total_price: string | null;
  currency: string;
  purchased_at: string;
}

interface ProductRow {
  id: string;
  quantity: string;
  unit_price: string | null;
  total_price: string | null;
  currency: string;
  purchased_at: string;
  store_name: string;
}

interface MonthRow {
  id: string;
  product_name: string;
  category: string | null;
  quantity: string;
  unit_price: string | null;
  total_price: string | null;
  currency: string;
  store_name: string;
  purchased_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_EMOJIS: Record<string, string> = {
  frutas: '🍎',
  verduras: '🥦',
  carnes: '🥩',
  lácteos: '🥛',
  lacteos: '🥛',
  limpieza: '🧹',
  higiene: '🧴',
  bebidas: '🥤',
  snacks: '🍪',
  granos: '🌾',
  cereales: '🌾',
  panadería: '🍞',
  panaderia: '🍞',
  congelados: '❄️',
  enlatados: '🥫',
};

function getCatEmoji(cat: string | null): string {
  if (!cat) return '📦';
  const lower = cat.toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return '📦';
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatCurrency(n: string | number | null, currency = 'MXN'): string {
  if (n == null) return '—';
  const num = typeof n === 'string' ? Number.parseFloat(n) : n;
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(num);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StatsDetailSheet({ open, detail, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<StockRow[] | StoreRow[] | ProductRow[] | MonthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch detail data when opened
  useEffect(() => {
    if (!open || !detail) return;
    setLoading(true);
    setError(null);
    setRows([]);

    const { type, value } = detail;
    let param: string;
    if (type === 'stock') {
      param = `level=${encodeURIComponent(value)}`;
    } else if (type === 'month') {
      param = `month=${encodeURIComponent(value)}`;
    } else {
      param = `name=${encodeURIComponent(value)}`;
    }

    fetch(`/api/stats/detail?type=${type}&${param}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setRows(data as typeof rows))
      .catch(() => setError('No se pudo cargar el detalle'))
      .finally(() => setLoading(false));
  }, [open, detail]);

  // Open / close native dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Backdrop click closes (use native listener, not React onClick on dialog)
  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open, onClose]);

  // ─── Row renderers ────────────────────────────────────────────────────────

  function renderStock() {
    return (rows as StockRow[]).map((r) => (
      <div
        key={r.id}
        className="flex items-center gap-3 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0"
      >
        <span className="text-xl">{getCatEmoji(r.category)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">{r.name}</p>
          {r.category && <p className="text-stone-400 text-xs capitalize">{r.category}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-stone-700 dark:text-stone-200 text-sm font-semibold">
            {Number.parseFloat(r.current_quantity).toFixed(1)} {r.unit}
          </p>
          {r.last_purchase_price && (
            <p className="text-stone-400 text-xs">
              Último: {formatCurrency(r.last_purchase_price)}
            </p>
          )}
        </div>
      </div>
    ));
  }

  function renderStore() {
    return (rows as StoreRow[]).map((r) => (
      <div
        key={r.id}
        className="flex items-center gap-3 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0"
      >
        <span className="text-xl">{getCatEmoji(r.category)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">
            {r.product_name}
          </p>
          <p className="text-stone-400 text-xs">{formatDate(r.purchased_at)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-stone-700 dark:text-stone-200 text-sm font-semibold">
            {formatCurrency(r.total_price, r.currency)}
          </p>
          <p className="text-stone-400 text-xs">×{Number.parseFloat(r.quantity).toFixed(1)}</p>
        </div>
      </div>
    ));
  }

  function renderProduct() {
    return (rows as ProductRow[]).map((r) => (
      <div
        key={r.id}
        className="flex items-center gap-3 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0"
      >
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
          <span className="text-base">🛍️</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800 dark:text-stone-100 text-sm">{r.store_name}</p>
          <p className="text-stone-400 text-xs">
            {formatDate(r.purchased_at)} · ×{Number.parseFloat(r.quantity).toFixed(1)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-stone-700 dark:text-stone-200 text-sm font-semibold">
            {formatCurrency(r.total_price, r.currency)}
          </p>
          <p className="text-stone-400 text-xs">
            {formatCurrency(r.unit_price, r.currency)}/u
          </p>
        </div>
      </div>
    ));
  }

  function renderMonth() {
    return (rows as MonthRow[]).map((r) => (
      <div
        key={r.id}
        className="flex items-center gap-3 py-3 border-b border-stone-100 dark:border-stone-800 last:border-0"
      >
        <span className="text-xl">{getCatEmoji(r.category)}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-stone-800 dark:text-stone-100 text-sm truncate">
            {r.product_name}
          </p>
          <p className="text-stone-400 text-xs">
            {r.store_name} · {formatDate(r.purchased_at)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-stone-700 dark:text-stone-200 text-sm font-semibold">
            {formatCurrency(r.total_price, r.currency)}
          </p>
        </div>
      </div>
    ));
  }

  function renderRows() {
    if (!detail) return null;
    if (detail.type === 'stock') return renderStock();
    if (detail.type === 'store') return renderStore();
    if (detail.type === 'product') return renderProduct();
    if (detail.type === 'month') return renderMonth();
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {/* Mobile: bottom sheet · Desktop: centered modal */}
      <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-4">
        <section className="pointer-events-auto w-full sm:max-w-lg bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-100 dark:border-stone-800 overflow-hidden max-h-[88dvh] sm:max-h-[80dvh] flex flex-col">
          {/* Handle bar — mobile only */}
          <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-stone-200 dark:bg-stone-700" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 sm:pt-5 pb-3 border-b border-stone-100 dark:border-stone-800 shrink-0">
            <h2 className="font-bold text-stone-800 dark:text-stone-100 text-base">
              {detail?.label ?? ''}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600 transition"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Content — flex-1 + min-h-0 allows overflow-y-auto to work correctly */}
          <div className="overflow-y-auto overscroll-contain px-5 py-2 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-6 flex-1 min-h-0">
            {loading && (
              <p className="py-8 text-center text-stone-400 text-sm">Cargando…</p>
            )}
            {error && (
              <p className="py-4 text-center text-rose-500 text-sm">{error}</p>
            )}
            {!loading && !error && rows.length === 0 && (
              <p className="py-8 text-center text-stone-400 text-sm">Sin datos</p>
            )}
            {!loading && !error && renderRows()}
          </div>
        </section>
      </div>
    </dialog>
  );
}
