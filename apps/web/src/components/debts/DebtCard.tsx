'use client';

import type { DebtWithProjection } from '@/lib/debt-data';
import { haptic } from '@/lib/haptic';
import ProgressRing from './ProgressRing';
import SplitBar from './SplitBar';
import {
  fmtDateKey,
  fmtMonths,
  fmtMoney,
  fmtMoneyShort,
  fmtRate,
  KIND_META,
  STATUS_META,
} from './debt-ui';

interface Props {
  readonly debt: DebtWithProjection;
  readonly onOpen: () => void;
  readonly onPay: () => void;
}

/** El día de corte, dicho como se dice: "vence hoy", "en 3 días". */
function dueLabel(days: number): string {
  if (days === 0) return '⚡ Corte hoy';
  if (days === 1) return '⏰ Corte mañana';
  return `⏰ Corte en ${days} días`;
}

/**
 * Tarjeta de una deuda. Se toca para ver el detalle y se desliza a la derecha
 * para abonar — el mismo gesto que ya existe en Pagos, para que no haya nada
 * nuevo que aprender.
 */
export default function DebtCard({ debt, onOpen, onPay }: Props) {
  const kind = KIND_META[debt.kind] ?? KIND_META.other;
  const status = STATUS_META[debt.projection.status];
  const isPaid = debt.projection.status === 'paid';
  const isStuck = debt.projection.neverPaysOff;
  const { firstSplit, installment, monthsToPayoff, payoffDate } = debt.projection;

  return (
    <div className="relative rounded-3xl">
      {/* Tocar la tarjeta abre el detalle; para abonar está el botón de abajo,
          siempre visible. Aquí había el mismo gesto de deslizar que en Pagos, y
          se quitó por lo mismo: con ratón solo hacía bailar la tarjeta, y
          escondía tras un gesto una acción que ya tiene su propio botón. */}
      <button
        type="button"
        onClick={onOpen}
        className="relative flex w-full flex-col gap-4 rounded-3xl border border-sky-100 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {/* Identidad + saldo */}
        <div className="flex items-center gap-4">
          <ProgressRing
            value={debt.breakdown.progress}
            color={status.ring}
            emoji={kind.emoji}
            size={56}
            label={`${Math.round(debt.breakdown.progress)} % del capital pagado`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-black">{debt.name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {debt.issuer ?? kind.label}
              {debt.accountLast4 && <span className="font-mono"> ···{debt.accountLast4}</span>}
              <span className="mx-1.5 text-slate-300">·</span>
              {fmtRate(debt.rate, debt.ratePeriod)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-extrabold leading-tight text-black">
              {fmtMoneyShort(debt.currentBalance, debt.currency)}
            </p>
            <p className="text-[11px] text-slate-400">debes hoy</p>
          </div>
        </div>

        {/* Estado + progreso */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.chip}`}>
            {status.emoji} {status.label}
          </span>
          {debt.breakdown.progress > 0 && (
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {Math.round(debt.breakdown.progress)} % pagado
            </span>
          )}
          {!isPaid && debt.daysUntilDue <= 5 && (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {dueLabel(debt.daysUntilDue)}
            </span>
          )}
          {debt.utilization !== null && debt.utilization >= 70 && (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
              🔥 {Math.round(debt.utilization)} % del cupo
            </span>
          )}
        </div>

        {/* El reparto de la próxima cuota — el corazón de la tarjeta */}
        {!isPaid && installment > 0 && (
          <div className="rounded-2xl bg-sky-50/70 p-3.5">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">Tu próxima cuota</span>
              <span className="text-lg font-extrabold text-black">
                {fmtMoney(installment, debt.currency)}
              </span>
            </div>
            <SplitBar
              interest={firstSplit.interest}
              principal={firstSplit.principal}
              currency={debt.currency}
            />
          </div>
        )}

        {/* Desenlace: cuándo termina, o por qué no termina */}
        {isPaid ? (
          <p className="text-sm font-bold text-sky-700">🎉 Liquidada — ya no te cuesta nada</p>
        ) : isStuck ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5">
            <p className="text-xs font-bold text-blue-800">
              🛑 Así nunca termina — {fmtMoney(debt.projection.monthlyInterest, debt.currency)} de
              interés al mes
            </p>
            <p className="mt-0.5 text-[11px] text-blue-700">
              Desde {fmtMoney(debt.projection.breakEven, debt.currency)} empieza a bajar
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-sky-50/70 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-slate-600">🏁 Libre en</span>
            <span className="text-sm font-bold text-sky-700">
              {fmtMonths(monthsToPayoff)}
              {payoffDate && (
                <span className="font-medium opacity-70"> · {fmtDateKey(payoffDate)}</span>
              )}
            </span>
          </div>
        )}
      </button>

      {/* Acción principal siempre alcanzable con el pulgar */}
      {!isPaid && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic();
            onPay();
          }}
          className="mt-2 w-full rounded-2xl bg-sky-500 py-3 text-sm font-bold text-white shadow-sm transition-all duration-150 hover:bg-sky-600 active:scale-95"
        >
          💸 Abonar
        </button>
      )}
    </div>
  );
}
