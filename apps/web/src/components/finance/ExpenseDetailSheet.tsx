'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';
import { EXPENSE_KINDS, expenseKindMeta, type ExpenseKind } from '@/lib/expense-kind';
import ModalShell from './ModalShell';
import { fmtMoneyFine } from './finance-ui';
import { parseMoney } from '@/lib/money-input';

interface Expense {
  id: string;
  storeName: string | null;
  date: string;
  total: number;
  kind: ExpenseKind;
  /**
   * Esta fila es una PARTE de un ticket de otro tipo, no el ticket entero.
   *
   * Un Publix de $35.71 con $21.94 mandados a farmacia aparece aqui por esos
   * $21.94. Editar el importe desde aqui reescribiria el total del recibo
   * entero, y borrar se llevaria el ticket de super con sus productos: por eso
   * estas filas no abren el editor, llevan al ticket.
   */
  fromSplit?: boolean;
}

interface Props {
  readonly expenseKind: ExpenseKind;
  readonly onClose: () => void;
  /** Los totales del plan acaban de cambiar: hay que recalcularlo. */
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

/** Una fecha ISO al `value` de un <input type="date">, sin corrimiento de zona. */
function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

/** Hoy, en la zona LOCAL: `toISOString()` daría ayer por la tarde en América. */
function todayInput(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Qué hay detrás de una fila de «Fuera del super».
 *
 * Aquí los elementos son TICKETS enteros, no líneas de producto: una cena o un
 * tanque de gasolina no tienen desglose que editar, tienen un sitio, un importe
 * y una fecha. Por eso esta hoja es distinta de la del super y no un modo más
 * de la misma: intentar servir a las dos con un solo componente acababa en un
 * formulario que no encaja del todo en ninguna.
 *
 * Se puede corregir cualquiera de los tres campos, cambiar el tipo de gasto
 * —incluido devolverlo a Súper, que lo manda de vuelta a Compras—, borrarlo, o
 * añadir uno nuevo sin pasar por el escáner.
 */
export default function ExpenseDetailSheet({ expenseKind, onClose, onChanged }: Props) {
  const toast = useToast();
  const router = useRouter();
  const meta = expenseKindMeta(expenseKind);

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const [store, setStore] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  const [adding, setAdding] = useState(false);
  const [newStore, setNewStore] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(todayInput);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/finance/spend-breakdown?kind=${encodeURIComponent(expenseKind)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) { setExpenses([]); return; }
      const data = (await res.json()) as { total: number; expenses: Expense[] };
      setExpenses(data.expenses ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setExpenses([]);
    }
  }, [expenseKind]);

  useEffect(() => { void load(); }, [load]);

  const afterChange = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  function startEdit(e: Expense) {
    haptic();
    setEditing(e.id);
    setStore(e.storeName ?? '');
    setAmount(e.total > 0 ? e.total.toFixed(2) : '');
    setDate(toDateInput(e.date));
  }

  async function patch(id: string, body: Record<string, unknown>, okMessage?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/proxy/shopping-trips/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      haptic([12, 30]);
      setEditing(null);
      if (okMessage) toast.show(okMessage, 'success');
      await afterChange();
    } catch {
      toast.show('No se pudo guardar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(e: Expense) {
    const a = parseMoney(amount);
    if (a === null || a <= 0) {
      toast.show('Pon un importe mayor que 0', 'error');
      return;
    }
    if (store.trim().length === 0) {
      toast.show('Pon dónde fue el gasto', 'error');
      return;
    }
    await patch(e.id, {
      storeName: store.trim(),
      totalAmount: a,
      // Mediodía UTC: guardar la medianoche hace que el día se vea como el
      // anterior al formatear en América.
      purchasedAt: new Date(`${date}T12:00:00.000Z`).toISOString(),
    });
  }

  async function move(e: Expense, target: ExpenseKind) {
    await patch(
      e.id,
      { kind: target },
      target === 'grocery'
        ? `${e.storeName ?? 'El ticket'} vuelve a Compras`
        : `${e.storeName ?? 'El ticket'} → ${expenseKindMeta(target).groupLabel}`,
    );
  }

  async function remove(e: Expense) {
    setBusyId(e.id);
    try {
      const res = await fetch(`/api/proxy/shopping-trips/${e.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) throw new Error();
      haptic([15, 40, 20]);
      setEditing(null);
      toast.show(`${e.storeName ?? 'Gasto'} eliminado`, 'success');
      await afterChange();
    } catch {
      toast.show('No se pudo eliminar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmAdd() {
    const a = parseMoney(newAmount);
    if (a === null || a <= 0) {
      toast.show('Pon un importe mayor que 0', 'error');
      return;
    }
    if (newStore.trim().length === 0) {
      toast.show('Pon dónde fue el gasto', 'error');
      return;
    }
    setBusyId('new');
    try {
      const res = await fetch('/api/proxy/shopping-trips', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: newStore.trim(),
          purchasedAt: new Date(`${newDate}T12:00:00.000Z`).toISOString(),
          totalAmount: a,
          currency: 'USD',
          kind: expenseKind,
          // Sin productos: este tipo de gasto no llena la despensa.
          items: [],
        }),
      });
      if (!res.ok) throw new Error();
      haptic([15, 40, 20]);
      setAdding(false);
      setNewStore('');
      setNewAmount('');
      setNewDate(todayInput());
      toast.show('Gasto agregado', 'success');
      await afterChange();
    } catch {
      toast.show('No se pudo agregar', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const count = expenses?.length ?? 0;

  return (
    <ModalShell
      emoji={meta.emoji}
      title={meta.groupLabel}
      headerClass="from-blue-100 to-sky-100"
      subtitle={
        expenses === null
          ? 'Cargando…'
          : `${fmtMoneyFine(total)} este mes en ${count} ${count === 1 ? 'gasto' : 'gastos'}`
      }
      onClose={onClose}
      footer={
        adding ? (
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="w-full rounded-2xl border border-sky-200 bg-white py-3 text-sm font-bold text-slate-600 transition active:scale-[0.98]"
          >
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { haptic(); setAdding(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white shadow-sm transition active:scale-[0.98] active:bg-blue-600"
          >
            <PlusIcon className="h-4 w-4" />
            Agregar gasto
          </button>
        )
      }
    >
      {expenses === null && <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>}

      {/* ── Alta ──────────────────────────────────────────────────────────── */}
      {expenses !== null && adding && (
        <div className="rounded-2xl bg-white p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-400">
              Dónde
            </span>
            <input
              type="text"
              autoFocus
              placeholder={expenseKind === 'dining' ? 'Ej. Pollo Tropical' : 'Ej. Shell'}
              value={newStore}
              onChange={(e) => setNewStore(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-400">
                Importe
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-400">
                Fecha
              </span>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busyId === 'new'}
            onClick={() => void confirmAdd()}
            className="mt-3 w-full rounded-xl bg-blue-500 py-2.5 text-xs font-black text-white disabled:opacity-60"
          >
            {busyId === 'new' ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      )}

      {/* ── Lista ─────────────────────────────────────────────────────────── */}
      {expenses !== null && !adding && (
        <div className="space-y-2">
          {count === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              No hay gastos de este tipo este mes.
            </p>
          )}
          {expenses.map((e) => {
            const open = editing === e.id;
            const busy = busyId === e.id;
            return (
              <div key={e.id} className="overflow-hidden rounded-2xl bg-white">
                <button
                  type="button"
                  onClick={() => {
                    // Una parte de otro ticket no se edita aqui: se abre el
                    // ticket, que es donde vive su reparto.
                    if (e.fromSplit) { haptic(); router.push(`/shopping-trips/${e.id}`); return; }
                    if (open) setEditing(null); else startEdit(e);
                  }}
                  aria-expanded={e.fromSplit ? undefined : open}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="shrink-0 text-xl" aria-hidden="true">{e.fromSplit ? '✂️' : '🏪'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {e.storeName ?? 'Sin nombre'}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {fmtDate(e.date)}
                      {e.fromSplit && ' · parte de un ticket'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums text-black">
                    {fmtMoneyFine(e.total)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`shrink-0 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`}
                  >
                    ⌄
                  </span>
                </button>

                {open && !e.fromSplit && (
                  <div className="border-t border-sky-100 bg-sky-50/60 px-4 py-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold text-slate-400">
                        Dónde
                      </span>
                      <input
                        type="text"
                        value={store}
                        onChange={(ev) => setStore(ev.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-400">
                          Importe
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amount}
                          onChange={(ev) => setAmount(ev.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-bold text-slate-400">
                          Fecha
                        </span>
                        <input
                          type="date"
                          value={date}
                          onChange={(ev) => setDate(ev.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                        />
                      </label>
                    </div>

                    {/* Cambiar de tipo, incluido devolverlo a Súper — que lo
                        saca del plan y lo manda de vuelta a Compras. Es la
                        forma de deshacer una clasificación equivocada sin
                        borrar el ticket y volver a crearlo. */}
                    <p className="mb-1.5 mt-3 text-[11px] font-bold text-slate-400">
                      Cambiar a
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {EXPENSE_KINDS.filter((k) => k.kind !== e.kind).map((k) => (
                        <button
                          key={k.kind}
                          type="button"
                          disabled={busy}
                          onClick={() => void move(e, k.kind)}
                          className="rounded-full border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition active:scale-95 disabled:opacity-50"
                        >
                          {k.emoji} {k.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(e)}
                        aria-label={`Eliminar ${e.storeName ?? 'gasto'}`}
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
                        onClick={() => void saveEdit(e)}
                        className="flex-1 rounded-xl bg-blue-500 py-2.5 text-xs font-black text-white disabled:opacity-60"
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
