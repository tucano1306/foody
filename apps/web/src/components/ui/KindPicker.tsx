'use client';

import { haptic } from '@/lib/haptic';
import { EXPENSE_KINDS, type ExpenseKind } from '@/lib/expense-kind';

interface Props {
  readonly value: ExpenseKind;
  readonly onChange: (kind: ExpenseKind) => void;
  /**
   * true cuando el valor lo puso el detector a partir del nombre de la tienda.
   * Cambia el pie a "lo adiviné, corrígeme" en lugar de callar.
   */
  readonly autoDetected?: boolean;
}

/**
 * Qué clase de gasto es este ticket.
 *
 * Seis botones grandes, sin desplegable y sin instrucciones: tocar el icono ES
 * la explicación. Viene con «Súper» puesto —el caso normal— así que quien solo
 * registra compras del super no tiene que tocar nada en su vida.
 *
 * Cuando el escáner reconoce la tienda ("Pollo Tropical" → Comida), el chip ya
 * llega elegido y el pie lo dice en una línea. Es una sugerencia visible, no una
 * decisión tomada a espaldas del usuario: si se equivoca, se toca otro y ya.
 */
export default function KindPicker({ value, onChange, autoDetected = false }: Props) {
  const isGrocery = value === 'grocery';

  return (
    <div>
      <p className="mb-2 text-xs font-bold text-slate-600">¿Qué tipo de compra es?</p>

      <div className="grid grid-cols-3 gap-2">
        {EXPENSE_KINDS.map((opt) => {
          const selected = value === opt.kind;
          return (
            <button
              key={opt.kind}
              type="button"
              onClick={() => { haptic(); onChange(opt.kind); }}
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

      {/* Una sola línea, y solo cuando aporta algo: dónde va a acabar el ticket.
          Es la pregunta que el usuario tiene de verdad ("¿esto sale en
          Compras?"), y responderla aquí evita que la descubra al no encontrarlo. */}
      <p className="mt-2 text-[11px] text-slate-500">
        {autoDetected && '✨ '}
        {isGrocery
          ? 'Va a Compras y cuenta para tu presupuesto de super.'
          : 'Va al Plan financiero como gasto del mes, no a Compras.'}
      </p>
    </div>
  );
}
