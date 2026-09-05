'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/solid';
import MoneyInput from '@/components/ui/MoneyInput';
import { haptic } from '@/lib/haptic';
import { EXPENSE_KINDS, expenseKindMeta, type ExpenseKind } from '@/lib/expense-kind';
import { remainderFor, splitsTotal, validateSplits, type TripSplitInput } from '@/lib/trip-splits';

interface Props {
  /** Total del ticket, tal como lo escribió el usuario. */
  readonly total: number;
  /** El tipo del ticket: lo que sobra después de repartir se queda aquí. */
  readonly mainKind: ExpenseKind;
  readonly splits: readonly TripSplitInput[];
  readonly onChange: (splits: TripSplitInput[]) => void;
}

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/**
 * Repartir un ticket entre la despensa y lo que no lo es.
 *
 * El caso que lo motiva: un carrito de Walmart lleva la compra de la semana y,
 * en el mismo recibo, las medicinas y una extensión de cable. Con un solo tipo
 * por ticket había que elegir, y las dos opciones mienten — marcarlo súper
 * infla el presupuesto de despensa con lo que no es comida, y marcarlo
 * farmacia saca la despensa entera de Compras y del comparador de precios.
 *
 * Empieza plegado a propósito: la mayoría de los tickets son de una sola cosa,
 * y quien no reparte nunca no debería ver ni un campo de más. Lo que sobra se
 * enseña SIEMPRE mientras se reparte, porque es la cifra que el usuario está
 * intentando cuadrar y hacérsela calcular de cabeza es el trabajo que la app
 * tiene que ahorrarle.
 */
export default function TripSplitsEditor({ total, mainKind, splits, onChange }: Props) {
  const [open, setOpen] = useState(splits.length > 0);
  const main = expenseKindMeta(mainKind);
  const repartido = splitsTotal(splits);
  const resto = remainderFor(total, splits);
  const error = validateSplits(total, splits);

  function add() {
    haptic(8);
    setOpen(true);
    // El primero se propone en el tipo que NO es el del ticket, que es la razón
    // entera de estar aquí: repetir el principal no reparte nada.
    const sugerido: ExpenseKind = mainKind === 'grocery' ? 'pharmacy' : 'grocery';
    onChange([...splits, { kind: sugerido, amount: 0, note: null }]);
  }

  function update(i: number, patch: Partial<TripSplitInput>) {
    onChange(splits.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function remove(i: number) {
    haptic(12);
    const next = splits.filter((_, idx) => idx !== i);
    onChange(next);
    if (next.length === 0) setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50/50 px-4 py-3 text-left transition active:scale-[0.99]"
      >
        <span className="text-xl" aria-hidden="true">🧾</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-800">
            ¿Este ticket trae algo que no es {main.groupLabel.toLowerCase()}?
          </span>
          <span className="block text-xs text-slate-500">
            Sepáralo y cada parte cuenta donde debe
          </span>
        </span>
        <PlusIcon className="h-5 w-5 shrink-0 text-sky-500" />
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/50 p-3.5">
      <AnimatePresence initial={false}>
        {splits.map((s, i) => (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-sky-100"
          >
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => { haptic(6); update(i, { kind: k.kind }); }}
                  aria-pressed={s.kind === k.kind}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                    s.kind === k.kind
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'
                  }`}
                >
                  <span aria-hidden="true">{k.emoji}</span> {k.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                <MoneyInput
                  aria-label={`Cuánto de ${expenseKindMeta(s.kind).label}`}
                  value={s.amount}
                  onChange={(amount) => update(i, { amount })}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-7 pr-3 text-sm font-semibold text-slate-800 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Quitar esta parte"
                className="rounded-xl p-2.5 text-slate-400 transition active:scale-90"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>

            <input
              value={s.note ?? ''}
              onChange={(e) => update(i, { note: e.target.value })}
              placeholder="¿Qué era? (opcional)"
              maxLength={80}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder-slate-300 focus:border-brand-500 focus:outline-none"
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sky-300 py-2 text-xs font-bold text-sky-600 transition active:scale-[0.98]"
      >
        <PlusIcon className="h-4 w-4" /> Otra parte
      </button>

      {/* La cuenta, siempre a la vista. Es lo que el usuario está cuadrando. */}
      <div className="rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-sky-100">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-500">Repartido</span>
          <span className="font-bold tabular-nums text-slate-700">{money(repartido)}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500">
            Queda en {main.groupLabel.toLowerCase()}
          </span>
          <span className={`text-base font-black tabular-nums ${error ? 'text-blue-600' : 'text-black'}`}>
            {money(resto)}
          </span>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
          {error}
        </p>
      )}
    </div>
  );
}
