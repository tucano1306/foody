'use client';

import { motion } from 'framer-motion';
import type { CashFlow } from '@/lib/finance-engine';
import type { BaselineSource } from '@/lib/grocery-insights';
import { fmtMoney } from './finance-ui';

const GROCERY_HINT: Record<BaselineSource, string> = {
  pace: 'según tus compras reales',
  average: 'tu promedio de tickets',
  limit: 'tu límite (aún sin compras)',
  none: 'sin datos',
};

interface Props {
  readonly cash: CashFlow;
  readonly groceriesSource: BaselineSource;
  readonly onOpenIncome: () => void;
  readonly onOpenPayments: () => void;
  readonly onOpenBudget: () => void;
}

interface Row {
  key: string;
  emoji: string;
  label: string;
  hint: string;
  amount: number;
  bar: string;
  onClick?: () => void;
}

/**
 * La cascada del mes: de lo que entra a lo que queda libre. Cada barra es
 * proporcional al ingreso, así se ve de un vistazo qué se está comiendo el sueldo.
 */
export default function CashFlowCard({ cash, groceriesSource, onOpenIncome, onOpenPayments, onOpenBudget }: Props) {
  const base = Math.max(cash.monthlyIncome, cash.fixedPayments + cash.groceriesEstimate, 1);

  const rows: Row[] = [
    {
      key: 'income',
      emoji: '💼',
      label: 'Ingresos',
      hint: cash.extraMonthly > 0 ? `incluye ${fmtMoney(cash.extraMonthly)} simulados` : 'todo lo que entra al mes',
      amount: cash.monthlyIncome + cash.extraMonthly,
      bar: 'from-emerald-300 to-teal-300',
      onClick: onOpenIncome,
    },
    {
      key: 'fixed',
      emoji: '📄',
      label: 'Pagos fijos',
      hint: 'renta, servicios, suscripciones',
      amount: -cash.fixedPayments,
      bar: 'from-rose-300 to-orange-300',
      onClick: onOpenPayments,
    },
    {
      key: 'groceries',
      emoji: '🛒',
      label: 'Super',
      hint: GROCERY_HINT[groceriesSource],
      amount: -cash.groceriesEstimate,
      bar: 'from-amber-300 to-yellow-300',
      onClick: onOpenBudget,
    },
  ];

  if (cash.debtCatchUp > 0) {
    rows.push({
      key: 'debt',
      emoji: '🔴',
      label: 'Ponerse al día',
      hint: 'abono a pagos atrasados',
      amount: -cash.debtCatchUp,
      bar: 'from-rose-400 to-pink-400',
      onClick: onOpenPayments,
    });
  }

  return (
    <section className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-navy-800 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black text-slate-700 dark:text-white uppercase tracking-wide">💵 Tu mes</h2>
        <span className="text-[11px] text-slate-400">toca una fila para editarla</span>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const width = Math.min(100, (Math.abs(row.amount) / base) * 100);
          const Wrapper = row.onClick ? 'button' : 'div';
          return (
            <Wrapper
              key={row.key}
              {...(row.onClick ? { type: 'button' as const, onClick: row.onClick } : {})}
              className="w-full text-left group"
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <span aria-hidden="true">{row.emoji}</span>
                  {row.label}
                  <span className="font-normal text-slate-400 hidden sm:inline">· {row.hint}</span>
                </span>
                <span
                  className={`text-sm font-black tabular-nums ${
                    row.amount >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {row.amount >= 0 ? '+' : '−'}{fmtMoney(Math.abs(row.amount))}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-linear-to-r ${row.bar} group-hover:brightness-105`}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
                />
              </div>
            </Wrapper>
          );
        })}
      </div>

      {/* Resultado */}
      <div
        className={`mt-4 rounded-2xl p-4 flex items-center justify-between gap-3 ${
          cash.available >= 0
            ? 'bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/5'
            : 'bg-linear-to-r from-rose-50 to-orange-50 dark:from-rose-500/10 dark:to-orange-500/5'
        }`}
      >
        <div>
          <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500 dark:text-slate-400">
            {cash.available >= 0 ? 'Te queda libre' : 'Te falta cada mes'}
          </p>
          <p
            className={`text-2xl font-black tabular-nums ${
              cash.available >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'
            }`}
          >
            {fmtMoney(Math.abs(cash.available))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Para metas</p>
          <p className="text-base font-black text-slate-700 dark:text-white tabular-nums">{fmtMoney(cash.goalsBudget)}</p>
          {cash.unallocated > 0 && (
            <p className="text-[11px] text-violet-500 dark:text-violet-300 font-semibold">
              {fmtMoney(cash.unallocated)} sin asignar
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
