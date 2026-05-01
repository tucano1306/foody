'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Product } from '@foody/types';
import PhotoLightbox from './PhotoLightbox';

interface LastPurchase {
  readonly purchasedAt: string;
  readonly storeName: string | null;
}

interface Props {
  readonly product: Product;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly lastPurchase?: LastPurchase;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
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

export default function ProductDetailSheet({ product, open, onClose, lastPurchase }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open, onClose]);

  return (
    <>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none">
          <section className="pointer-events-auto w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-fade-up overflow-hidden">

            {/* ── Photo area ─────────────────────────────── */}
            <div className="relative aspect-video bg-stone-100">
              {product.photoUrl ? (
                <button
                  type="button"
                  aria-label="Ampliar foto"
                  onClick={() => setLightboxOpen(true)}
                  className="absolute inset-0 w-full h-full focus:outline-none"
                >
                  {product.photoUrl.startsWith('data:') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.photoUrl} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <Image src={product.photoUrl} alt={product.name} fill className="object-cover" sizes="100vw" />
                  )}
                  <span className="absolute bottom-2 right-2 text-[10px] bg-black/50 text-white px-2 py-1 rounded-full backdrop-blur-sm">
                    Toca para zoom
                  </span>
                </button>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl bg-linear-to-br from-sky-50 to-stone-100 opacity-60">
                  🥑
                </div>
              )}

              {/* Close button */}
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition focus:outline-none"
              >
                ✕
              </button>
            </div>

            {/* ── Info ───────────────────────────────────── */}
            <div className="px-4 pt-4 pb-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-stone-900 truncate">{product.name}</h2>
                {product.category && (
                  <p className="text-xs text-stone-400 uppercase tracking-wide mt-0.5">{product.category}</p>
                )}
                {product.lastPurchasePrice != null && (
                  <p className="mt-1 text-2xl font-extrabold text-stone-900">
                    {formatMoney(product.lastPurchasePrice, product.currency ?? 'MXN')}
                  </p>
                )}
              </div>

              {/* ── Stats ─────────────────────────────── */}
              {(product.totalSpent > 0 || lastPurchase) && (
                <div className="flex gap-3">
                  {product.totalSpent > 0 && (
                    <div className="flex-1 rounded-xl bg-stone-50 p-3">
                      <p className="text-[10px] text-stone-400 uppercase tracking-wide">Total gastado</p>
                      <p className="text-sm font-bold text-brand-700 mt-0.5">{formatMoney(product.totalSpent, product.currency ?? 'MXN')}</p>
                    </div>
                  )}
                  {lastPurchase && (
                    <div className="flex-1 rounded-xl bg-stone-50 p-3">
                      <p className="text-[10px] text-stone-400 uppercase tracking-wide">Última compra</p>
                      <p className="text-sm font-semibold text-stone-700 mt-0.5">{formatRelativeTime(lastPurchase.purchasedAt)}</p>
                      {lastPurchase.storeName && (
                        <p className="text-[10px] text-stone-400 truncate">en {lastPurchase.storeName}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Edit link ──────────────────────────── */}
              <a
                href={`/products/${product.id}`}
                className="block text-center w-full py-3 rounded-xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 text-stone-700 font-semibold transition text-sm"
              >
                ✏️ Editar producto
              </a>
            </div>
          </section>
        </div>
      </dialog>

      {lightboxOpen && product.photoUrl && (
        <PhotoLightbox src={product.photoUrl} alt={product.name} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}
