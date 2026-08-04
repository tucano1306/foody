'use client';

import { useMemo, useState } from 'react';
import type { DebtWithProjection } from '@/lib/debt-data';
import { simulateExtra } from '@/lib/debt-engine';
import { haptic } from '@/lib/haptic';
import { fmtMonths, fmtMoney } from './debt-ui';

interface Props {
  readonly debt: DebtWithProjection;
}

/**
 * "¿Y si abono un poco más?"
 *
 * El deslizador recalcula en cada movimiento porque el argumento no es el
 * número final, sino ver cómo se desploma el interés total mientras se arrastra
 * el dedo. Los pasos salen de la propia cuota, así que la escala tiene sentido
 * para cualquier deuda, sea de $200 o de $200 000.
 */
export default function PayoffSimulator({ debt }: Props) {
  const step = useMemo(() => {
    const base = Math.max(debt.projection.installment * 0.1, 5);
    return Math.max(1, Math.round(base));
  }, [debt.projection.installment]);

  const max = step * 20;
  const [extra, setExtra] = useState(step * 2);

  const sim = useMemo(
    () =>
      simulateExtra(
        {
          balance: debt.currentBalance,
          rate: debt.rate,
          ratePeriod: debt.ratePeriod,
          strategy: debt.strategy,
          termMonths: debt.termMonths,
          customPayment: debt.customPayment,
          minPercent: debt.minPercent,
          minFloor: debt.minFloor,
          extraMonthly: debt.extraMonthly,
        },
        extra,
      ),
    [debt, extra],
  );

  if (debt.currentBalance <= 0) return null;

  return (
    <section className="rounded-3xl bg-linear-to-br from-sky-500 to-blue-600 p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-white">⚡ Si abonas extra</p>
        <p className="text-2xl font-extrabold text-white">
          +{fmtMoney(extra, debt.currency, 0)}
        </p>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={extra}
        onChange={(e) => {
          haptic(6);
          setExtra(Number(e.target.value));
        }}
        aria-label="Abono extra cada mes"
        className="mt-4 h-3 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-white [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white/15 px-3.5 py-3">
          <p className="text-[11px] font-semibold text-white/75">Terminas antes</p>
          <p className="text-lg font-extrabold text-white">
            {sim.monthsSaved > 0 ? fmtMonths(sim.monthsSaved) : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-white/15 px-3.5 py-3">
          <p className="text-[11px] font-semibold text-white/75">Te ahorras</p>
          <p className="text-lg font-extrabold text-white">
            {sim.interestSaved > 0 ? fmtMoney(sim.interestSaved, debt.currency, 0) : '—'}
          </p>
        </div>
      </div>

      {sim.breaksTheTrap && (
        <p className="mt-3 rounded-2xl bg-white/20 px-3.5 py-2.5 text-xs font-bold text-white">
          🔓 Con este extra tu deuda deja de ser eterna: termina en{' '}
          {fmtMonths(sim.newMonths)}
        </p>
      )}
    </section>
  );
}
