'use client';

import { haptic } from '@/lib/haptic';
import { scopeOf, splitAmount, type ExpenseScope } from '@/lib/expense-scope';

interface Props {
  /** 0-100: qué parte es del negocio. */
  readonly value: number;
  readonly onChange: (businessShare: number) => void;
  /** Importe del gasto, para enseñar el reparto en dinero mientras se ajusta. */
  readonly amount?: number;
  readonly currency?: string;
  /** Etiqueta del bloque. En ingresos conviene decir «facturación». */
  readonly label?: string;
}

const OPTIONS: readonly { scope: ExpenseScope; emoji: string; label: string; share: number }[] = [
  { scope: 'personal', emoji: '🏠', label: 'Personal', share: 0 },
  { scope: 'business', emoji: '🏢', label: 'Negocio', share: 100 },
  { scope: 'mixed', emoji: '⚖️', label: 'Mixto', share: 50 },
];

/**
 * Selector de ámbito: personal, del negocio, o repartido entre los dos.
 *
 * Tres botones y, solo si se elige «Mixto», aparece el deslizador. Quien no
 * tenga negocio toca «Personal» una vez —o no toca nada, porque ya viene
 * puesto— y no ve un porcentaje en su vida. La opción compleja no le cobra
 * peaje a quien no la necesita.
 *
 * Mientras se arrastra, el reparto se muestra en DINERO y no en porcentaje:
 * «$60 negocio · $40 casa» se entiende sin traducir nada.
 */
export default function ScopePicker({
  value,
  onChange,
  amount,
  currency = 'USD',
  label = '¿De quién es este gasto?',
}: Props) {
  const current = scopeOf(value);
  const split = amount && amount > 0 ? splitAmount(amount, value) : null;

  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-600">{label}</p>

      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const selected = current === opt.scope;
          return (
            <button
              key={opt.scope}
              type="button"
              onClick={() => {
                haptic();
                // Al volver a «Mixto» se recupera un reparto usable, no el 0
                // o el 100 que lo dejarían indistinguible de los otros dos.
                onChange(opt.scope === 'mixed' && (value <= 0 || value >= 100) ? 50 : opt.share);
              }}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-all duration-150 active:scale-95 ${
                selected
                  ? 'border-sky-500 bg-sky-500 text-white shadow-md'
                  : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">{opt.emoji}</span>
              <span className="text-[11px] font-bold leading-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {current === 'mixed' && (
        <div className="mt-3 rounded-2xl bg-sky-50 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-slate-600">
              🏢 {Math.round(value)} % negocio
            </span>
            <span className="text-xs font-bold text-slate-600">
              {100 - Math.round(value)} % personal 🏠
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={99}
            step={1}
            value={Math.round(value)}
            onChange={(e) => {
              haptic(6);
              onChange(Number(e.target.value));
            }}
            aria-label="Porcentaje que corresponde al negocio"
            className="mt-2.5 h-3 w-full cursor-pointer appearance-none rounded-full bg-sky-200 accent-sky-500 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-500 [&::-webkit-slider-thumb]:shadow-lg"
          />

          {split && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-500">Negocio</p>
                <p className="text-sm font-extrabold text-black">{fmt(split.business)}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-500">Personal</p>
                <p className="text-sm font-extrabold text-black">{fmt(split.personal)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
