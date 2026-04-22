'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@foody/types';
import { haptic } from '@/lib/haptic';

interface Props {
  readonly open: boolean;
  readonly product: Product;
  readonly onClose: () => void;
  readonly onSaved?: (updated: Product) => void;
}

function formatCurrency(value: number, currency: string): string {
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

export default function RegisterPurchaseModal(props: Readonly<Props>) {
  const { open, product, onClose, onSaved } = props;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [quantity, setQuantity] = useState<string>('1');
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit');
  const [price, setPrice] = useState<string>('');
  const [store, setStore] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currency = product.currency ?? 'MXN';

  // open/close sync
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // reset on open
  useEffect(() => {
    if (!open) return;
    setQuantity('1');
    setPriceMode('unit');
    setPrice(
      product.lastPurchasePrice == null ? '' : product.lastPurchasePrice.toFixed(2),
    );
    setStore('');
    setError(null);
    setSubmitting(false);
  }, [open, product.lastPurchasePrice]);

  // backdrop click
  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open, onClose]);

  const qtyNum = Number.parseFloat(quantity);
  const priceNum = Number.parseFloat(price);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;
  const priceValid = Number.isFinite(priceNum) && priceNum >= 0;
  const canSubmit = qtyValid && priceValid && !submitting;

  let unitPreview = 0;
  let totalPreview = 0;
  if (qtyValid && priceValid) {
    if (priceMode === 'unit') {
      unitPreview = priceNum;
      totalPreview = priceNum * qtyNum;
    } else {
      unitPreview = priceNum / qtyNum;
      totalPreview = priceNum;
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/proxy/products/${product.id}/purchases`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: qtyNum,
            ...(priceMode === 'unit'
              ? { unitPrice: priceNum }
              : { totalPrice: priceNum }),
            storeName: store.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }
      const body = (await res.json()) as { product: Product };
      haptic([15, 40, 20]);
      onSaved?.(body.product);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none">
        <section className="pointer-events-auto w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl animate-fade-up">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-brand-600 font-semibold">
                🛒 Registrar compra
              </p>
              <h2 className="text-lg font-bold text-stone-800 truncate">{product.name}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="text-stone-400 hover:text-stone-600 text-xl leading-none px-2"
            >
              ✕
            </button>
          </div>

          {/* Quantity */}
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Cantidad ({product.unit})
          </label>
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setQuantity((q) => String(Math.max(0, (Number.parseFloat(q) || 0) - 1)))}
              className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-stone-200 text-lg font-bold text-stone-600"
            >
              −
            </button>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="flex-1 text-center text-xl font-semibold bg-stone-50 border border-stone-200 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="button"
              onClick={() => setQuantity((q) => String((Number.parseFloat(q) || 0) + 1))}
              className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-stone-200 text-lg font-bold text-stone-600"
            >
              +
            </button>
          </div>

          {/* Price mode toggle */}
          <div className="flex gap-1 p-1 bg-stone-100 rounded-xl mb-2">
            {(['unit', 'total'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPriceMode(m)}
                className={`flex-1 text-xs font-semibold py-2 rounded-lg transition ${
                  priceMode === m
                    ? 'bg-white text-stone-800 shadow-sm'
                    : 'text-stone-500'
                }`}
              >
                {m === 'unit' ? 'Precio unitario' : 'Total pagado'}
              </button>
            ))}
          </div>

          <label className="block text-sm font-medium text-stone-700 mb-1">
            {priceMode === 'unit' ? `Precio por ${product.unit}` : 'Total pagado'}
          </label>
          <div className="relative mb-3">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-medium">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full pl-8 pr-4 py-2.5 text-lg font-semibold bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Live preview */}
          {qtyValid && priceValid && (
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-3 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Unitario:</span>
                <span className="font-medium">{formatCurrency(unitPreview, currency)}</span>
              </div>
              <div className="flex justify-between text-stone-800 font-bold mt-1">
                <span>Total:</span>
                <span className="text-brand-700">{formatCurrency(totalPreview, currency)}</span>
              </div>
            </div>
          )}

          {/* Store */}
          <label className="block text-sm font-medium text-stone-700 mb-1">
            <span>Tienda <span className="text-stone-400 font-normal">(opcional)</span></span>
            <input
              type="text"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="Walmart, Soriana…"
              className="mt-1 w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>
          <div className="mb-4" />

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-medium hover:bg-stone-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Guardando…' : 'Guardar compra'}
            </button>
          </div>

          <p className="text-center text-[11px] text-stone-400 mt-3">
            Se sumará al stock y al gasto total
          </p>
        </section>
      </div>
    </dialog>
  );
}
