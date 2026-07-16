'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Product, ShoppingTripDetail, UpdateShoppingTripDto } from '@foody/types';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';

interface Props {
  readonly trip: ShoppingTripDetail;
  readonly products: Product[];
}

interface EditItem {
  key: string;
  productId: string;
  name: string;
  quantity: string;
  price: string; // '' = sin precio manual (Foody lo estima del total)
}

const STRATEGY_LABELS: Record<string, string> = {
  manual_partial: 'Mixto',
  by_quantity: 'Por cantidad',
  equal: 'Igual',
  none: 'Sin precios',
};

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  try {
    // Las fechas de ticket se guardan a medianoche UTC; formatear en la zona
    // local mostraría el día anterior (p.ej. eliges 16 y ves "15 de julio").
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function itemsFromTrip(trip: ShoppingTripDetail): EditItem[] {
  return trip.items.map((pp) => ({
    key: pp.id,
    productId: pp.productId,
    name: pp.productName ?? 'Producto',
    quantity: String(pp.quantity),
    // Solo los precios puestos a mano se conservan como manuales; los
    // estimados ("est.") se recalculan del total al guardar.
    price: pp.priceSource === 'manual' && pp.unitPrice != null ? pp.unitPrice.toFixed(2) : '',
  }));
}

export default function TripDetailClient({ trip, products }: Readonly<Props>) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Campos de edición ────────────────────────────────────────────────────
  const [store, setStore] = useState(trip.storeName ?? '');
  const [date, setDate] = useState(trip.purchasedAt.slice(0, 10));
  const [total, setTotal] = useState(trip.totalAmount > 0 ? trip.totalAmount.toFixed(2) : '');
  const [notes, setNotes] = useState(trip.notes ?? '');
  const [items, setItems] = useState<EditItem[]>(() => itemsFromTrip(trip));
  const [search, setSearch] = useState('');

  const addedIds = useMemo(() => new Set(items.map((it) => it.productId)), [items]);
  const searchQ = search.trim().toLowerCase();
  const candidates = useMemo(
    () =>
      searchQ.length === 0
        ? []
        : products
            .filter((p) => !addedIds.has(p.id))
            .filter((p) => p.name.toLowerCase().includes(searchQ))
            .slice(0, 6),
    [products, searchQ, addedIds],
  );

  const parsedTotal = Number.parseFloat(total);
  const totalValid = Number.isFinite(parsedTotal) && parsedTotal > 0;
  const storeValid = store.trim().length > 0;
  const canSave = storeValid && totalValid && !saving;

  function startEdit() {
    setStore(trip.storeName ?? '');
    setDate(trip.purchasedAt.slice(0, 10));
    setTotal(trip.totalAmount > 0 ? trip.totalAmount.toFixed(2) : '');
    setNotes(trip.notes ?? '');
    setItems(itemsFromTrip(trip));
    setSearch('');
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: p.id,
        name: p.name,
        quantity: '1',
        price: p.lastPurchasePrice == null ? '' : p.lastPurchasePrice.toFixed(2),
      },
    ]);
    setSearch('');
    haptic(10);
  }

  function updateItem(key: string, patch: Partial<EditItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const dto: UpdateShoppingTripDto = {
        storeName: store.trim(),
        purchasedAt: new Date(date).toISOString(),
        totalAmount: parsedTotal,
        notes,
        items: items.map((it) => {
          const qty = Number.parseFloat(it.quantity);
          const price = Number.parseFloat(it.price);
          const hasPrice = Number.isFinite(price) && price >= 0 && it.price.trim() !== '';
          return {
            productId: it.productId,
            quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
            ...(hasPrice ? { unitPrice: price } : {}),
          };
        }),
      };
      const res = await fetch(`/api/proxy/shopping-trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dto),
      });
      if (!res.ok) {
        let msg = `No se pudo guardar (error ${res.status})`;
        try {
          const data = (await res.json()) as { message?: string };
          if (data.message) msg = data.message;
        } catch { /* cuerpo no-JSON */ }
        throw new Error(msg);
      }
      haptic([15, 40, 20]);
      toast.show('Ticket actualizado ✨', 'success');
      setEditing(false);
      router.refresh();
    } catch (e) {
      const msg = e instanceof TypeError
        ? 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
        : e instanceof Error ? e.message : 'Error al guardar';
      setError(msg);
      toast.show('No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/proxy/shopping-trips/${trip.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) throw new Error(`Error ${res.status}`);
      haptic([15, 40, 20]);
      toast.show('Ticket eliminado', 'success');
      router.push('/shopping-trips');
      router.refresh();
    } catch {
      toast.show('No se pudo eliminar el ticket', 'error');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`space-y-4 ${editing ? 'pb-24' : ''}`}>
      <Link href="/shopping-trips" className="text-sm text-stone-500 hover:text-stone-700">
        ← Volver a compras
      </Link>

      {/* ── Encabezado del ticket ─────────────────────────────────────────── */}
      <header className="rounded-2xl bg-white p-5 shadow-sm border border-stone-100">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-brand-600 font-semibold">Ticket</p>
          {!editing && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
              Estrategia: {STRATEGY_LABELS[trip.allocationStrategy] ?? trip.allocationStrategy}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="block text-xs font-semibold text-stone-500 mb-1">
                Tienda <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={store}
                onChange={(e) => setStore(e.target.value)}
                placeholder="Ej. Walmart, Publix, Soriana…"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:border-brand-500 ${
                  storeValid ? 'border-stone-200 bg-white' : 'border-red-300 bg-red-50'
                }`}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-stone-500 mb-1">Fecha</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:border-brand-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-stone-500 mb-1">
                  Total pagado <span className="text-red-500">*</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold text-stone-800 focus:outline-none focus:border-brand-500 ${
                    totalValid ? 'border-stone-200 bg-white' : 'border-red-300 bg-red-50'
                  }`}
                />
              </label>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-stone-800 mt-1">
              🏪 {trip.storeName ?? 'Sin tienda'}
            </h1>
            <p className="text-sm text-stone-500 mt-1">{formatDate(trip.purchasedAt)}</p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-stone-500">
                {trip.items.length} producto{trip.items.length === 1 ? '' : 's'}
              </p>
              <p className="text-2xl font-bold text-brand-700">
                {formatCurrency(trip.totalAmount, trip.currency)}
              </p>
            </div>
          </>
        )}
      </header>

      {/* ── Acciones (modo vista) ─────────────────────────────────────────── */}
      {!editing && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 text-white px-4 py-3 text-sm font-semibold shadow hover:bg-brand-700 active:scale-[0.98] transition"
          >
            ✏️ Editar ticket
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-200 text-red-600 px-4 py-3 text-sm font-semibold hover:bg-red-50 active:scale-[0.98] transition"
          >
            🗑️ Eliminar
          </button>
        </div>
      )}

      {/* ── Productos ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
        <h2 className="font-semibold text-stone-800 mb-3">
          Productos ({editing ? items.length : trip.items.length})
        </h2>

        {editing ? (
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="rounded-xl bg-stone-50 text-stone-400 text-sm px-3 py-4 text-center">
                Sin productos — se guardará solo el total.
              </p>
            )}
            {items.map((it) => (
              <div key={it.key} className="rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-stone-800 truncate">{it.name}</p>
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  >
                    Quitar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="block">
                    <span className="block text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">
                      Cantidad
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={it.quantity}
                      onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
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
                      placeholder="Foody lo estima"
                      value={it.price}
                      onChange={(e) => updateItem(it.key, { price: e.target.value })}
                      className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
              </div>
            ))}

            {/* Agregar producto */}
            <div className="relative pt-1">
              <input
                type="text"
                placeholder="＋ Buscar producto para agregar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-dashed border-brand-300 bg-brand-50/40 px-3 py-2.5 text-sm text-stone-800 placeholder-brand-400 focus:border-brand-500 focus:outline-none"
              />
              {candidates.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 rounded-xl border border-stone-200 bg-white shadow-md max-h-44 overflow-auto">
                  {candidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 flex items-center justify-between"
                    >
                      <span className="font-medium text-stone-700 truncate">{p.name}</span>
                      <span className="text-xs text-stone-400 ml-2 shrink-0">{p.unit}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchQ.length > 0 && candidates.length === 0 && (
                <p className="mt-1 px-1 text-xs text-stone-400">Sin coincidencias en tu catálogo.</p>
              )}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {trip.items.length === 0 && (
              <li className="rounded-xl bg-stone-50 text-stone-400 text-sm px-3 py-4 text-center">
                Este ticket solo registra el total — edítalo para agregar productos.
              </li>
            )}
            {trip.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-stone-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-800 truncate">
                    {item.quantity} × {item.productName ?? 'Producto'}
                  </p>
                  <p className="text-xs text-stone-500 flex items-center gap-1">
                    {item.unitPrice != null && (
                      <>
                        {formatCurrency(item.unitPrice, item.currency)} c/u
                        {item.priceSource === 'allocated' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                            est.
                          </span>
                        )}
                      </>
                    )}
                    {item.unitPrice == null && <span className="text-stone-400">Sin precio</span>}
                  </p>
                </div>
                <p className="font-semibold text-stone-700">
                  {item.totalPrice == null ? '—' : formatCurrency(item.totalPrice, item.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Notas ─────────────────────────────────────────────────────────── */}
      {editing ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
          <h2 className="font-semibold text-stone-800 mb-2">Notas</h2>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas opcionales…"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-800 placeholder-stone-300 focus:border-brand-500 focus:outline-none resize-none"
          />
        </section>
      ) : (
        trip.notes && (
          <section className="rounded-2xl bg-white p-4 shadow-sm border border-stone-100">
            <h2 className="font-semibold text-stone-800 mb-2">Notas</h2>
            <p className="text-sm text-stone-600 whitespace-pre-wrap">{trip.notes}</p>
          </section>
        )
      )}

      {error && (
        <p className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{error}</p>
      )}

      {/* ── Barra fija de guardado (modo edición) ─────────────────────────── */}
      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-100 bg-white/95 backdrop-blur px-4 py-3">
          <div className="container mx-auto max-w-5xl flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-stone-500">Total</p>
              <p className="text-lg font-bold text-stone-800">
                {totalValid ? formatCurrency(parsedTotal, trip.currency) : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="rounded-xl border border-stone-200 text-stone-600 px-4 py-3 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="rounded-xl bg-brand-600 text-white px-6 py-3 text-sm font-semibold shadow hover:bg-brand-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Guardando…' : '💾 Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de confirmación de borrado ──────────────────────────────── */}
      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => !deleting && setConfirmingDelete(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-fade-up">
            <div className="text-center">
              <span className="text-4xl">🗑️</span>
              <h3 className="text-lg font-bold text-stone-800 mt-2">¿Eliminar este ticket?</h3>
              <p className="text-sm text-stone-500 mt-1">
                Se borrará el ticket de {trip.storeName ?? 'esta compra'} y sus{' '}
                {trip.items.length} producto{trip.items.length === 1 ? '' : 's'} del historial.
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-xl border border-stone-200 text-stone-600 px-4 py-3 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-semibold shadow hover:bg-red-700 disabled:opacity-60 transition"
              >
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
