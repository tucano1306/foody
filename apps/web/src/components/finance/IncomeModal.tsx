'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import ModalShell from './ModalShell';
import { monthlyEquivalent, type IncomeFrequency, type IncomeSource } from '@/lib/finance-engine';
import { FREQUENCY_LABEL, fmtMoney } from './finance-ui';

export interface IncomePayload {
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  isActive: boolean;
}

interface Props {
  readonly incomes: readonly IncomeSource[];
  readonly onCreate: (payload: IncomePayload) => Promise<void>;
  readonly onToggle: (id: string, isActive: boolean) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}

const FREQUENCIES: readonly IncomeFrequency[] = ['monthly', 'biweekly', 'weekly', 'yearly'];

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition';

export default function IncomeModal({ incomes, onCreate, onToggle, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMonthly = incomes
    .filter((i) => i.isActive)
    .reduce((s, i) => s + monthlyEquivalent(i.amount, i.frequency), 0);

  async function add() {
    const value = Number.parseFloat(amount);
    if (!name.trim()) return setError('Ponle un nombre (ej. Sueldo)');
    if (!Number.isFinite(value) || value <= 0) return setError('El monto debe ser mayor a 0');

    setError(null);
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), amount: value, frequency, isActive: true });
      setName('');
      setAmount('');
      haptic([10, 20, 10]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Tus ingresos"
      subtitle="Todo lo que entra cada mes — sueldo, freelance, rentas, bonos"
      emoji="💼"
      headerClass="from-emerald-100 to-teal-100 dark:from-emerald-500/20 dark:to-teal-500/10"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-bold">Total mensual</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-300 tabular-nums">{fmtMoney(totalMonthly)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20"
          >
            Listo
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Lista */}
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {incomes.map((inc) => (
              <motion.div
                key={inc.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
                  inc.isActive
                    ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/25'
                    : 'bg-slate-50 border-slate-200 dark:bg-white/5 dark:border-white/10 opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => { haptic(8); void onToggle(inc.id, !inc.isActive); }}
                  aria-label={inc.isActive ? 'Desactivar' : 'Activar'}
                  className={`relative w-10 h-6 rounded-full shrink-0 transition ${
                    inc.isActive ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      inc.isActive ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{inc.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {fmtMoney(inc.amount)} · {FREQUENCY_LABEL[inc.frequency]}
                    {inc.frequency !== 'monthly' && ` → ${fmtMoney(monthlyEquivalent(inc.amount, inc.frequency))}/mes`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { haptic(14); void onDelete(inc.id); }}
                  aria-label={`Eliminar ${inc.name}`}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition shrink-0"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {incomes.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-6">
              Aún no registras ingresos. Agrega el primero abajo 👇
            </p>
          )}
        </div>

        {/* Alta */}
        <div className="rounded-2xl border border-dashed border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5 p-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sueldo"
              className={inputCls}
              maxLength={120}
            />
            <div className="relative w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="3000"
                className={`${inputCls} pl-7 font-bold`}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFrequency(f); haptic(6); }}
                className={`py-2 rounded-xl text-[11px] font-bold transition ${
                  frequency === f
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200 ring-2 ring-emerald-200'
                    : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10'
                }`}
              >
                {FREQUENCY_LABEL[f]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            <PlusIcon className="w-4 h-4" />
            {busy ? 'Agregando…' : 'Agregar ingreso'}
          </button>

          {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">{error}</p>}
        </div>
      </div>
    </ModalShell>
  );
}
