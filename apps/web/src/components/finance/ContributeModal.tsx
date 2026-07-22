'use client';

import { useState } from 'react';
import { haptic } from '@/lib/haptic';
import ModalShell from './ModalShell';
import type { GoalProjection } from '@/lib/finance-engine';
import { KIND_META, fmtMoney, fmtMoneyFine } from './finance-ui';

interface Props {
  readonly goal: GoalProjection;
  readonly onContribute: (amount: number, note: string | null) => Promise<void>;
  readonly onClose: () => void;
}

export default function ContributeModal({ goal, onContribute, onClose }: Props) {
  const meta = KIND_META[goal.kind];
  const suggested = Math.max(1, Math.round(goal.allocatedMonthly || goal.requiredMonthly));
  const [amount, setAmount] = useState(String(suggested));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number.parseFloat(amount);
  const valid = Number.isFinite(value) && value !== 0;
  const after = valid ? Math.max(0, goal.savedAmount + value) : goal.savedAmount;
  const pctAfter = goal.targetAmount > 0 ? Math.min(100, (after / goal.targetAmount) * 100) : 0;

  const quick = [
    Math.round(suggested / 4),
    Math.round(suggested / 2),
    suggested,
    Math.round(goal.remaining),
  ].filter((n, i, arr) => n > 0 && arr.indexOf(n) === i);

  async function submit() {
    if (!valid) return setError('Escribe un monto distinto de 0');
    setError(null);
    setBusy(true);
    try {
      await onContribute(value, note.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar');
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={`Aportar a ${goal.name}`}
      subtitle={`Llevas ${fmtMoney(goal.savedAmount)} de ${fmtMoney(goal.targetAmount)}`}
      emoji={goal.emoji || meta.emoji}
      headerClass={meta.gradient}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !valid}
            className="flex-[1.4] py-3 rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
          >
            {busy ? 'Guardando…' : '💰 Registrar aporte'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide" htmlFor="contrib-amount">
            Monto del aporte
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">$</span>
            <input
              id="contrib-amount"
              type="number"
              inputMode="decimal"
              step="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-9 pr-4 py-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-2xl font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 transition"
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Usa un monto negativo si necesitas retirar dinero de esta meta.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => { setAmount(String(q)); haptic(6); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                Number(amount) === q
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200 ring-2 ring-emerald-200'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {fmtMoney(q)}
              {q === Math.round(goal.remaining) && ' · completar'}
            </button>
          ))}
        </div>

        {/* Cómo queda la meta */}
        <div className="rounded-2xl bg-slate-50 dark:bg-white/5 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quedaría en</span>
            <span className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
              {fmtMoneyFine(after)} <span className="text-slate-400 font-medium">/ {fmtMoney(goal.targetAmount)}</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-400 transition-all duration-500"
              style={{ width: `${pctAfter}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {pctAfter >= 100
              ? '🎉 ¡Con este aporte completas la meta!'
              : `Avanzas al ${Math.round(pctAfter)}% — te faltarían ${fmtMoney(Math.max(0, goal.targetAmount - after))}.`}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide" htmlFor="contrib-note">
            Nota (opcional)
          </label>
          <input
            id="contrib-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Bono de julio"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            maxLength={500}
          />
        </div>

        {error && (
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
