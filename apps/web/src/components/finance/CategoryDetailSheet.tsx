'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';
import { CATEGORY_EMOJI, KNOWN_CATEGORIES, UNCATEGORIZED_LABEL } from '@/lib/categories';
import { UNITEMIZED_LABEL } from '@/lib/grocery-insights';
import ModalShell from './ModalShell';
import { fmtMoneyFine } from './finance-ui';
import { parseMoney, parseDecimal } from '@/lib/money-input';

interface BreakdownItem {
  id: string;
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  purchasedAt: string;
  storeName: string | null;
  tripId: string | null;
}

interface BreakdownTrip {
  id: string;
  storeName: string | null;
  date: string;
  total: number;
  itemsTotal: number;
  gap: number;
  itemCount: number;
}

interface Breakdown {
  kind: 'category' | 'unitemized';
  category: string;
  total: number;
  items: BreakdownItem[];
  trips: BreakdownTrip[];
}

interface LiteProduct {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  last_purchase_price: string | number | null;
}

interface Props {
  readonly category: string;
  readonly onClose: () => void;
  /** El plan tiene que recalcularse: los totales de arriba acaban de cambiar. */
  readonly onChanged: () => void;
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' })
      .format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Mismo emoji que la fila de la tarjeta: abrirla no puede cambiar de icono. */
function emojiFor(category: string): string {
  if (category === UNITEMIZED_LABEL) return '🧾';
  return CATEGORY_EMOJI[category.toLowerCase()] ?? '🛒';
}

/**
 * Qué hay detrás de una fila de «En qué se va este mes».
 *
 * La tarjeta enseñaba totales que no se podían tocar: «Sin categoría $10» no
 * dice nada y no había forma de averiguar de qué era ni de arreglarlo. Aquí se
 * ven las compras que lo componen y se corrigen —importe, cantidad, categoría—,
 * se borran o se añaden.
 *
 * «Sin detallar» es otra cosa y se trata como tal: no hay líneas que editar,
 * hay TICKETS a los que les faltan sus productos. Se listan con lo que falta
 * por explicar y llevan al recibo, que es donde se añaden.
 */
export default function CategoryDetailSheet({ category, onClose, onChanged }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Fila abierta en modo edición. Solo una a la vez: es una hoja de móvil. */
  const [editing, setEditing] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [amount, setAmount] = useState('');

  // Alta de una línea nueva
  const [adding, setAdding] = useState(false);
  const [catalog, setCatalog] = useState<LiteProduct[] | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<LiteProduct | null>(null);
  const [newAmount, setNewAmount] = useState('');
  const [newQty, setNewQty] = useState('1');

  const isUnitemized = category === UNITEMIZED_LABEL;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/spend-breakdown?category=${encodeURIComponent(category)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(); }, [load]);

  /** Toda mutación termina igual: recargar la hoja y avisar al plan. */
  const afterChange = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  function startEdit(item: BreakdownItem) {
    haptic();
    setEditing(item.id);
    setQty(String(item.quantity));
    setAmount(item.totalPrice.toFixed(2));
  }

  async function saveEdit(item: BreakdownItem) {
    const q = parseDecimal(qty);
    const a = parseMoney(amount);
    if (q === null || q <= 0 || a === null || a < 0) {
      toast.show('Revisa la cantidad y el importe', 'error');
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/product-purchases/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: q, totalPrice: a }),
      });
      if (!res.ok) throw new Error();
      haptic([12, 30]);
      setEditing(null);
      await afterChange();
    } catch {
      toast.show('No se pudo guardar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function move(item: BreakdownItem, target: string) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/product-purchases/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // «Sin categoría» no es una categoría real: se guarda como vacío para
        // que el producto vuelva a no tener ninguna.
        body: JSON.stringify({ category: target === UNCATEGORIZED_LABEL ? '' : target }),
      });
      if (!res.ok) throw new Error();
      haptic([12, 30]);
      setEditing(null);
      toast.show(`${item.productName} → ${target}`, 'success');
      await afterChange();
    } catch {
      toast.show('No se pudo mover', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: BreakdownItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/product-purchases/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) throw new Error();
      haptic([15, 40, 20]);
      setEditing(null);
      toast.show(`${item.productName} eliminado`, 'success');
      await afterChange();
    } catch {
      toast.show('No se pudo eliminar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function openAdd() {
    haptic();
    setAdding(true);
    if (catalog === null) {
      try {
        const res = await fetch('/api/products?lite=true', { credentials: 'include' });
        setCatalog(res.ok ? await res.json() : []);
      } catch {
        setCatalog([]);
      }
    }
  }

  async function confirmAdd() {
    if (!picked) return;
    const q = parseDecimal(newQty);
    const a = parseMoney(newAmount);
    if (q === null || q <= 0 || a === null || a <= 0) {
      toast.show('Pon una cantidad y un importe', 'error');
      return;
    }
    setBusyId('new');
    try {
      const res = await fetch(`/api/products/${picked.id}/purchases`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: q, totalPrice: a }),
      });
      if (!res.ok) throw new Error();

      // La compra se queda en la categoría QUE YA TIENE el producto, aunque no
      // sea esta hoja. Mudarlo para que la línea apareciera aquí le arrancaba
      // su categoría buena: agregar un aguacate desde «Sin categoría» dejaba
      // «Aguacate» sin categoría para siempre. Añadir una compra no es
      // reclasificar nada — para eso están los chips de «Mover a».
      //
      // A cambio, el aviso dice dónde acabó, que es la pregunta que deja
      // abierta que la línea no salga en esta lista.
      const destino = picked.category?.trim() || UNCATEGORIZED_LABEL;
      haptic([15, 40, 20]);
      setAdding(false);
      setPicked(null);
      setSearch('');
      setNewAmount('');
      setNewQty('1');
      toast.show(
        destino === category
          ? `${picked.name} agregado`
          : `${picked.name} agregado a ${destino}`,
        'success',
      );
      await afterChange();
    } catch {
      toast.show('No se pudo agregar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const q = search.trim().toLowerCase();
  const candidates = (catalog ?? [])
    .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
    .slice(0, 8);

  return (
    <ModalShell
      emoji={emojiFor(category)}
      title={category}
      subtitle={
        loading
          ? 'Cargando…'
          : isUnitemized
            ? `${fmtMoneyFine(data?.total ?? 0)} sin explicar en ${data?.trips.length ?? 0} ${(data?.trips.length ?? 0) === 1 ? 'ticket' : 'tickets'}`
            : `${fmtMoneyFine(data?.total ?? 0)} este mes en ${data?.items.length ?? 0} ${(data?.items.length ?? 0) === 1 ? 'compra' : 'compras'}`
      }
      onClose={onClose}
      footer={
        isUnitemized ? undefined : adding ? (
          <button
            type="button"
            onClick={() => { setAdding(false); setPicked(null); setSearch(''); }}
            className="w-full rounded-2xl border border-sky-200 bg-white py-3 text-sm font-bold text-slate-600 transition active:scale-[0.98]"
          >
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void openAdd()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 py-3.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] active:bg-sky-600"
          >
            <PlusIcon className="h-4 w-4" />
            Agregar producto
          </button>
        )
      }
    >
      {loading && <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>}

      {/* ── Alta de una línea ─────────────────────────────────────────────── */}
      {!loading && adding && (
        <div className="space-y-3">
          {picked === null ? (
            <>
              <input
                type="text"
                autoFocus
                placeholder="Buscar en tu catálogo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-sky-500 focus:outline-none"
              />
              {catalog === null ? (
                <p className="py-4 text-center text-xs text-slate-400">Cargando catálogo…</p>
              ) : candidates.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">
                  Sin coincidencias en tu catálogo.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {candidates.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          haptic();
                          setPicked(p);
                          const last = p.last_purchase_price == null ? null : Number(p.last_purchase_price);
                          setNewAmount(last && last > 0 ? last.toFixed(2) : '');
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-left transition active:scale-[0.99]"
                      >
                        <span className="min-w-0 truncate text-sm font-bold text-slate-700">{p.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">{p.category ?? 'Sin categoría'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-white p-4">
              <p className="text-sm font-black text-black">{picked.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-400">
                    Cantidad
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-400">
                    Importe total
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0.00"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setPicked(null); setNewAmount(''); }}
                  className="rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600"
                >
                  Otro producto
                </button>
                <button
                  type="button"
                  disabled={busyId === 'new'}
                  onClick={() => void confirmAdd()}
                  className="rounded-xl bg-sky-500 py-2.5 text-xs font-black text-white disabled:opacity-60"
                >
                  {busyId === 'new' ? 'Guardando…' : 'Agregar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tickets sin desglosar ─────────────────────────────────────────── */}
      {!loading && !adding && isUnitemized && (
        <div className="space-y-2">
          {(data?.trips.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Todos tus tickets de este mes están desglosados.
            </p>
          )}
          {data?.trips.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { haptic(); router.push(`/shopping-trips/${t.id}`); }}
              className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left transition active:scale-[0.99]"
            >
              <span className="shrink-0 text-xl" aria-hidden="true">🏪</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">
                  {t.storeName ?? 'Sin tienda'}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {fmtDate(t.date)} · {t.itemCount === 0
                    ? 'sin productos'
                    : `${t.itemCount} ${t.itemCount === 1 ? 'producto' : 'productos'} de ${fmtMoneyFine(t.total)}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-black tabular-nums text-black">{fmtMoneyFine(t.gap)}</span>
                <span className="block text-[11px] text-slate-400">por detallar</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-slate-300">›</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Compras de una categoría ──────────────────────────────────────── */}
      {!loading && !adding && !isUnitemized && (
        <div className="space-y-2">
          {(data?.items.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              No hay compras de esta categoría este mes.
            </p>
          )}
          {data?.items.map((item) => {
            const open = editing === item.id;
            const busy = busyId === item.id;
            return (
              <div key={item.id} className="overflow-hidden rounded-2xl bg-white">
                <button
                  type="button"
                  onClick={() => (open ? setEditing(null) : startEdit(item))}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {item.productName}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {item.quantity} × {item.unitPrice == null ? '—' : fmtMoneyFine(item.unitPrice)}
                      {' · '}{fmtDate(item.purchasedAt)}
                      {item.storeName ? ` · ${item.storeName}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums text-black">
                    {fmtMoneyFine(item.totalPrice)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`}
                  >
                    ⌄
                  </span>
                </button>

                {open && (
                  <div className="border-t border-sky-100 bg-sky-50/60 px-4 py-3">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-400">
                          Cantidad
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-400">
                          Importe
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"
                        />
                      </label>
                    </div>

                    {/* Mover de categoría. Es la acción que de verdad vacía los
                        cajones «Otro» y «Sin categoría», así que va a la vista
                        y no escondida detrás de otro menú. */}
                    <p className="mb-1.5 mt-3 text-[11px] font-bold text-slate-400">
                      Mover a
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {KNOWN_CATEGORIES.filter((c) => c !== item.category).map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={busy}
                          onClick={() => void move(item, c)}
                          className="rounded-full border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition active:scale-95 disabled:opacity-50"
                        >
                          {CATEGORY_EMOJI[c.toLowerCase()] ?? '📦'} {c}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(item)}
                        aria-label={`Eliminar ${item.productName}`}
                        className="shrink-0 rounded-xl border border-blue-200 bg-white p-2.5 text-blue-600 transition active:scale-95 disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(item)}
                        className="flex-1 rounded-xl bg-sky-500 py-2.5 text-xs font-black text-white disabled:opacity-60"
                      >
                        {busy ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}
