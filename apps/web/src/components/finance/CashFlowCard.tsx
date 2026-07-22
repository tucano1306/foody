'use client';

import { motion } from 'framer-motion';
import type { CashFlow } from '@/lib/finance-engine';
import type { BaselineSource } from '@/lib/grocery-insights';
import { CARD, LABEL, NUM, fmtMoney } from './finance-ui';

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
      bar: 'from-sky-300 to-sky-400',
      onClick: onOpenIncome,
    },
    {
      key: 'fixed',
      emoji: '📄',
      label: 'Pagos fijos',
      hint: 'renta, servicios, suscripciones',
      amount: -cash.fixedPayments,
      bar: 'from-blue-300 to-blue-400',
      onClick: onOpenPayments,
    },
    {
      key: 'groceries',
      emoji: '🛒',
      label: 'Super',
      hint: GROCERY_HINT[groceriesSource],
      amount: -cash.groceriesEstimate,
      bar: 'from-sky-200 to-sky-300',
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
      bar: 'from-blue-400 to-blue-500',
      onClick: onOpenPayments,
    });
  }

  return (
    <section className={`rounded-3xl shadow-sm p-5 ${CARD}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-sm font-black uppercase tracking-wide ${NUM}`}>💵 Tu mes</h2>
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
                <span className={`text-sm font-black tabular-nums ${NUM}`}>
                  {row.amount >= 0 ? '+' : '−'}{fmtMoney(Math.abs(row.amount))}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/80 dark:bg-white/5 overflow-hidden">
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
      <div className="mt-4 rounded-2xl p-4 flex items-center justify-between gap-3 bg-linear-to-r from-sky-100 to-blue-100 dark:from-sky-500/10 dark:to-blue-500/5">
        <div>
          <p className={`text-[11px] uppercase tracking-wide font-bold ${LABEL}`}>
            {cash.available >= 0 ? 'Te queda libre' : 'Te falta cada mes'}
          </p>
          <p className={`text-2xl font-black tabular-nums ${NUM}`}>{fmtMoney(Math.abs(cash.available))}</p>
        </div>
        <div className="text-right">
          <p className={`text-[11px] ${LABEL}`}>Para metas</p>
          <p className={`text-base font-black tabular-nums ${NUM}`}>{fmtMoney(cash.goalsBudget)}</p>
          {cash.unallocated > 0 && (
            <p className="text-[11px] font-semibold text-black dark:text-white">
              {fmtMoney(cash.unallocated)} sin asignar
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
