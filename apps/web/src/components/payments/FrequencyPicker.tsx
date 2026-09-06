'use client';

import { haptic } from '@/lib/haptic';
import {
  cycleFromDate,
  FREQUENCY_LABEL,
  monthlyCost,
  nextDueOn,
  PAYMENT_FREQUENCIES,
  type PaymentFrequency,
} from '@/lib/payment-frequency';

interface Props {
  readonly frequency: PaymentFrequency;
  readonly anchorMonth: number | null;
  readonly dueDay: number;
  /** Importe de CADA cobro, para enseñar a cuánto sale al mes. */
  readonly amount: number;
  readonly currency?: string;
  readonly onChange: (next: {
    frequency: PaymentFrequency;
    anchorMonth: number | null;
    dueDay: number;
  }) => void;
  /** Estilo oscuro para la hoja de detalle, que va sobre fondo azul marino. */
  readonly dark?: boolean;
}

/** Fecha en `YYYY-MM-DD` local — la que entiende un `<input type="date">`. */
function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Cada cuánto se paga un recibo, y cuándo cae el próximo.
 *
 * Vive aparte porque hace falta en los DOS sitios donde se toca un recibo —el
 * alta y el editor— y tenerlo solo en el alta dejó un seguro semestral anclado
 * en el mes equivocado sin forma de corregirlo.
 *
 * La fecha se pregunta ENTERA y no como «día del mes» + «mes» sueltos: nadie
 * piensa una póliza en esos términos, y con dos campos separados es fácil dejar
 * el día en 1 y el mes en el actual — que es exactamente cómo un seguro de
 * abril acabó reclamándose en agosto.
 */
export default function FrequencyPicker({
  frequency,
  anchorMonth,
  dueDay,
  amount,
  currency = 'USD',
  onChange,
  dark = false,
}: Props) {
  const label = dark ? 'text-xs font-semibold text-slate-400' : 'text-sm font-semibold text-slate-700';
  const hint = dark ? 'text-xs text-slate-500' : 'text-xs text-slate-400';
  const input = dark
    ? 'w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm'
    : 'w-full px-4 py-3 rounded-2xl border border-sky-200 text-black focus:outline-none focus:ring-2 focus:ring-brand-300 transition text-base';

  return (
    <div>
      <span className={`block mb-1.5 ${label}`}>Cada cuánto se paga</span>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {PAYMENT_FREQUENCIES.map((f) => {
          const active = frequency === f;
          const on = dark ? 'bg-brand-500 text-white' : 'bg-sky-500 text-white shadow-sm';
          const off = dark ? 'bg-white/10 text-slate-300 hover:bg-white/20' : 'bg-sky-50 text-slate-600 hover:bg-sky-100';
          return (
            <button
              key={f}
              type="button"
              onClick={() => {
                haptic(6);
                onChange({
                  frequency: f,
                  // Al volver a mensual el anclaje sobra: vence todos los meses.
                  anchorMonth: f === 'monthly' ? null : (anchorMonth ?? new Date().getMonth() + 1),
                  dueDay,
                });
              }}
              aria-pressed={active}
              className={`rounded-xl px-2 py-2.5 text-[11px] font-bold transition ${active ? on : off}`}
            >
              {FREQUENCY_LABEL[f]}
            </button>
          );
        })}
      </div>

      {/* La fecha solo se pregunta cuando hace falta: en un recibo mensual el
          día ya se pide aparte y un mes concreto no significaría nada. */}
      {frequency !== 'monthly' && (
        <div className="mt-2.5">
          <label htmlFor="payment-next-due" className={`block mb-1 ${label}`}>
            ¿Cuándo es el próximo cobro?
          </label>
          <input
            id="payment-next-due"
            type="date"
            value={toDateInput(nextDueOn(frequency, anchorMonth, dueDay))}
            onChange={(e) => {
              const cycle = cycleFromDate(e.target.value);
              if (!cycle) return;
              onChange({ frequency, anchorMonth: cycle.anchorMonth, dueDay: cycle.dueDay });
            }}
            className={input}
          />
          <p className={`mt-1 ${hint}`}>
            De ahí salen los siguientes: {FREQUENCY_LABEL[frequency].toLowerCase()}.
            {amount > 0 && ` Son ${currency} ${monthlyCost(amount, frequency).toFixed(2)} al mes.`}
          </p>
        </div>
      )}
    </div>
  );
}
