'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { DebtOverview } from '@/lib/finance-engine';
import { fmtMoney } from './finance-ui';

interface Props {
  readonly debts: DebtOverview;
}

/**
 * Plan de salida de deuda: los pagos atrasados en orden de bola de nieve
 * (el más pequeño primero) con el abono mensual sugerido y el mes de liquidación.
 */
export default function DebtPanel({ debts }: Props) {
  if (debts.overdueTotal <= 0) return null;

  const max = Math.max(...debts.payoffOrder.map((d) => d.debt), 1);

  return (
    <section className="rounded-3xl border border-rose-200 dark:border-rose-500/25 bg-linear-to-br from-rose-50 to-orange-50 dark:from-rose-500/10 dark:to-orange-500/5 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black text-rose-800 dark:text-rose-200 uppercase tracking-wide">
            🔴 Plan de salida de deuda
          </h2>
          <p className="text-xs text-rose-700/80 dark:text-rose-200/70 mt-1">
            Método bola de nieve: liquida primero la más pequeña.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-rose-600/80 dark:text-rose-300/70 font-bold">Total</p>
          <p className="text-xl font-black text-rose-700 dark:text-rose-200 tabular-nums">{fmtMoney(debts.overdueTotal)}</p>
        </div>
      </div>

      <ol className="space-y-2.5">
        {debts.payoffOrder.map((debt, i) => (
          <motion.li
            key={debt.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl bg-white/70 dark:bg-white/5 px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black ${
                  i === 0 ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300'
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{debt.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {debt.missedMonths} {debt.missedMonths === 1 ? 'mes' : 'meses'} sin registrar
                </p>
              </div>
              <span className="text-sm font-black text-rose-600 dark:text-rose-300 tabular-nums shrink-0">
                {fmtMoney(debt.debt)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-rose-100 dark:bg-white/10 mt-2 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-rose-400 to-orange-400"
                initial={{ width: 0 }}
                animate={{ width: `${(debt.debt / max) * 100}%` }}
                transition={{ duration: 0.7, delay: i * 0.07 }}
              />
            </div>
          </motion.li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/70 dark:bg-white/5 px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-bold">Abono sugerido</p>
          <p className="text-lg font-black text-slate-800 dark:text-white tabular-nums">
            {fmtMoney(debts.monthlyCatchUp)}<span className="text-xs font-medium text-slate-400">/mes</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {debts.monthsToClear
              ? `Libre de atrasos en ${debts.monthsToClear} ${debts.monthsToClear === 1 ? 'mes' : 'meses'}`
              : 'Sin dinero libre para abonar — primero hay que bajar gastos'}
          </p>
        </div>
        <Link
          href="/payments"
          className="shrink-0 px-4 py-2.5 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-sm transition"
        >
          Ver pagos →
        </Link>
      </div>
    </section>
  );
}
