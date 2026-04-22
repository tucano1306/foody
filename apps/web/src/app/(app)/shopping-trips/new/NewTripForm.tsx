'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  AllocationStrategy,
  CreateShoppingTripDto,
  Product,
} from '@foody/types';
import StoreSelector from '@/components/stores/StoreSelector';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';

interface Props {
  readonly products: Product[];
}

interface LineItem {
  productId: string;
  name: string;
  unit: string;
  quantity: string;
  price: string; // optional manual unit price
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

const STRATEGY_OPTIONS: ReadonlyArray<{
  value: AllocationStrategy;
  label: string;
  hint: string;
}> = [
  {
    value: 'manual_partial',
    label: 'Mixto',
    hint: 'Pon precio donde recuerdes, Foody estima el resto.',
  },
  {
    value: 'by_quantity',
    label: 'Por cantidad',
    hint: 'Reparte el total según cantidad y precio previo.',
  },
  { value: 'equal', label: 'Igual', hint: 'Divide el total en partes iguales.' },
  {
    value: 'none',
    label: 'Sin precios',
    hint: 'Solo actualiza stock, no guarda precios.',
  },
];

export default function NewTripForm({ products }: Readonly<Props>) {
  const router = useRouter();
  const toast = useToast();

  const [store, setStore] = useState<{ storeId: string | null; storeName: string | null }>(
    { storeId: null, storeName: null },
  );
  const [purchasedAt, setPurchasedAt] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [currency] = useState<string>('MXN');
  const [strategy, setStrategy] = useState<AllocationStrategy>('manual_partial');
  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addedIds = new Set(items.map((i) => i.productId));
  const searchQ = search.trim().toLowerCase();
  const candidates = useMemo(
    () =>
      products
        .filter((p) => !addedIds.has(p.id))
        .filter((p) => (searchQ ? p.name.toLowerCase().includes(searchQ) : true))
        .slice(0, 8),
    [products, searchQ, addedIds],
  );

  // ─── Predictive AI: smart suggestions ──────────────────────────────────────
  // Products that are empty or half — user is probably buying these today.
  const smartSuggestions = useMemo(
    () =>
      products
        .filter((p) => !addedIds.has(p.id))
        .filter((p) => p.stockLevel === 'empty' || p.stockLevel === 'half')
        .sort((a, b) => {
          // empty first, then by last purchase recency
          if (a.stockLevel !== b.stockLevel) {
            return a.stockLevel === 'empty' ? -1 : 1;
          }
          return (
            new Date(b.lastPurchaseDate ?? 0).getTime() -
            new Date(a.lastPurchaseDate ?? 0).getTime()
          );
        })
        .slice(0, 8),
    [products, addedIds],
  );

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        quantity: '1',
        // Predictive: prefill with last known unit price when available.
        price:
          p.lastPurchasePrice == null ? '' : p.lastPurchasePrice.toFixed(2),
      },
    ]);
    setSearch('');
  }

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // Preview allocation
  const parsedTotal = Number.parseFloat(totalAmount);
  const totalValid = Number.isFinite(parsedTotal) && parsedTotal > 0;

  const preview = useMemo(() => {
    const n = items.length;
    if (n === 0) return [] as { total: number; source: 'manual' | 'allocated' | 'unknown' }[];

    const parsed = items.map((it) => {
      const qty = Number.parseFloat(it.quantity);
      const price = Number.parseFloat(it.price);
      const hasManualUnit = Number.isFinite(price) && price >= 0 && it.price.trim() !== '';
      const qtyOk = Number.isFinite(qty) && qty > 0;
      return { qty: qtyOk ? qty : 0, manualUnit: hasManualUnit ? price : null };
    });

    if (strategy === 'none') {
      return parsed.map((p) => ({
        total: p.manualUnit == null ? 0 : round2(p.manualUnit * p.qty),
        source: p.manualUnit == null ? ('unknown' as const) : ('manual' as const),
      }));
    }
    if (!totalValid) {
      return parsed.map((p) => ({
        total: p.manualUnit == null ? 0 : round2(p.manualUnit * p.qty),
        source: p.manualUnit == null ? ('unknown' as const) : ('manual' as const),
      }));
    }

    if (strategy === 'equal') {
      const per = round2(parsedTotal / n);
      return parsed.map(() => ({ total: per, source: 'allocated' as const }));
    }

    const weights = parsed.map((p) => Math.max(0.01, p.qty * (p.manualUnit ?? 1)));
    const sumW = weights.reduce((a, b) => a + b, 0) || n;

    if (strategy === 'by_quantity') {
      return parsed.map((_, i) => ({
        total: round2((parsedTotal * weights[i]) / sumW),
        source: 'allocated' as const,
      }));
    }

    // manual_partial
    const manualSum = parsed.reduce(
      (s, p) => s + (p.manualUnit == null ? 0 : p.manualUnit * p.qty),
      0,
    );
    const remaining = round2(parsedTotal - manualSum);
    const unpricedW = parsed
      .map((p, i) => ({ idx: i, w: p.manualUnit == null ? weights[i] : 0 }))
      .filter((x) => x.w > 0);
    const unpricedSum = unpricedW.reduce((a, b) => a + b.w, 0) || 1;
    return parsed.map((p, i) => {
      if (p.manualUnit == null) {
        if (remaining <= 0) return { total: 0, source: 'unknown' as const };
        const share = round2((remaining * weights[i]) / unpricedSum);
        return { total: share, source: 'allocated' as const };
      }
      return { total: round2(p.manualUnit * p.qty), source: 'manual' as const };
    });
  }, [items, strategy, parsedTotal, totalValid]);

  const canSubmit =
    items.length > 0 &&
    items.every((it) => Number.parseFloat(it.quantity) > 0) &&
    (strategy === 'none' || totalValid) &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const dto: CreateShoppingTripDto = {
        storeId: store.storeId ?? undefined,
        storeName: store.storeName ?? undefined,
        purchasedAt: new Date(purchasedAt).toISOString(),
        totalAmount: totalValid ? parsedTotal : 0,
        currency,
        allocationStrategy: strategy,
        items: items.map((it) => {
          const qty = Number.parseFloat(it.quantity);
          const price = Number.parseFloat(it.price);
          const hasPrice =
            Number.isFinite(price) && price >= 0 && it.price.trim() !== '';
          return {
            productId: it.productId,
            quantity: qty,
            ...(hasPrice ? { unitPrice: price } : {}),
          };
        }),
      };
      const res = await fetch('/api/proxy/shopping-trips', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Error ${res.status}`);
      }
      haptic([15, 40, 20]);
      toast.show('Compra guardada ✨', 'success');
      router.push('/shopping-trips');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
      toast.show('No se pudo guardar', 'error');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">🧾 Nueva compra</h1>
          <p className="text-sm text-stone-500">
            Captura tu ticket, pon precios donde recuerdes y Foody estima el resto.
          </p>
        </div>
        <Link
          href="/shopping-trips"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          Cancelar
        </Link>
      </header>

      {/* Store + date */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100 space-y-3">
        <div>
          <p className="block text-xs font-semibold text-stone-500 mb-1">Tienda</p>
          <StoreSelector value={store} onChange={setStore} />
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-stone-500 mb-1">Fecha</span>
          <input
            type="date"
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:border-brand-500 focus:outline-none"
          />
        </label>
      </section>

      {/* Total */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
        <label className="block">
          <span className="block text-xs font-semibold text-stone-500 mb-1">
            Total pagado
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-400">{currency}</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-lg font-semibold text-stone-800 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </label>
        <p className="text-xs text-stone-400 mt-1">
          El monto total del ticket. Foody reparte entre tus productos.
        </p>
      </section>

      {/* Strategy */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
        <p className="text-xs font-semibold text-stone-500 mb-2">
          ¿Cómo quieres repartir precios?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {STRATEGY_OPTIONS.map((opt) => {
            const selected = strategy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStrategy(opt.value)}
                className={
                  'text-left rounded-xl border p-3 transition ' +
                  (selected
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                    : 'border-stone-200 bg-white hover:border-stone-300')
                }
              >
                <p className="text-sm font-semibold text-stone-800">{opt.label}</p>
                <p className="text-xs text-stone-500 mt-0.5 leading-snug">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Items */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">Productos comprados</h2>
          <span className="text-xs text-stone-400">{items.length} artículo(s)</span>
        </div>

        {/* Smart suggestions — predictive */}
        {smartSuggestions.length > 0 && (
          <div className="rounded-xl bg-brand-50/50 border border-brand-100 p-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-brand-700 mb-2 flex items-center gap-1">
              ✨ Sugerencias para ti{' '}
              <span className="text-stone-400 font-normal normal-case tracking-normal ml-1">
                (productos bajos o agotados)
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {smartSuggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-full bg-white border border-brand-200 text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition flex items-center gap-1"
                  title={
                    p.stockLevel === 'empty'
                      ? 'Se acabó — agrégalo'
                      : 'Queda poco — agrégalo'
                  }
                >
                  <span>{p.stockLevel === 'empty' ? '🚨' : '⚠️'}</span>
                  <span className="truncate max-w-36">{p.name}</span>
                  <span className="text-[10px] text-stone-400">+</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it, idx) => {
              const prev = preview[idx];
              return (
                <li
                  key={it.productId}
                  className="rounded-xl border border-stone-100 p-3 bg-stone-50/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-stone-800 truncate">{it.name}</p>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="block">
                      <span className="block text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">
                        Cantidad ({it.unit})
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(idx, { quantity: e.target.value })
                        }
                        className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">
                        Precio unitario (opcional)
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="—"
                        value={it.price}
                        onChange={(e) => updateItem(idx, { price: e.target.value })}
                        className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                  {prev && (
                    <p className="text-xs text-stone-500 mt-1.5 flex items-center gap-1">
                      <span>Subtotal:</span>
                      <strong className="text-stone-700">
                        {formatCurrency(prev.total, currency)}
                      </strong>
                      {prev.source === 'allocated' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                          est.
                        </span>
                      )}
                      {prev.source === 'unknown' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded">
                          sin precio
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Search + add */}
        <div>
          <input
            type="text"
            placeholder="Buscar producto para agregar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:border-brand-500 focus:outline-none"
          />
          {search && (
            <div className="mt-2 rounded-xl border border-stone-200 bg-white max-h-56 overflow-auto">
              {candidates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-stone-400">
                  Sin coincidencias. Crea primero el producto desde la pestaña Productos.
                </p>
              ) : (
                candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center justify-between"
                  >
                    <span className="font-medium text-stone-700 truncate">{p.name}</span>
                    <span className="text-xs text-stone-400">{p.unit}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>
      )}

      {/* Sticky submit */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-100 bg-white/95 backdrop-blur px-4 py-3">
        <div className="container mx-auto max-w-5xl flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-stone-500">Total</p>
            <p className="text-lg font-bold text-stone-800">
              {totalValid
                ? formatCurrency(parsedTotal, currency)
                : '—'}
            </p>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="rounded-xl bg-brand-600 text-white px-6 py-3 text-sm font-semibold shadow hover:bg-brand-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Guardando…' : 'Guardar compra'}
          </button>
        </div>
      </div>
    </div>
  );
}
