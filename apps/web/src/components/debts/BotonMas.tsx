'use client';

import { EllipsisHorizontalIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';

interface Props {
  readonly onClick: () => void;
  /** Para el lector de pantalla: de qué son las acciones. */
  readonly de: string;
}

/**
 * El «⋯» de una tarjeta de Deudas: abre sus demás acciones.
 *
 * Va pegado al botón de abonar y con su misma altura, en la franja del pulgar:
 * los tres puntos son el icono universal de «más», y ahí se aciertan sin
 * buscarlos. Antes cada acción era una línea de texto suelta debajo de la
 * tarjeta, y cada acción nueva alargaba la tarjeta un poco más.
 */
export default function BotonMas({ onClick, de }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        haptic();
        onClick();
      }}
      aria-label={`Más acciones de ${de}`}
      aria-haspopup="dialog"
      className="grid min-h-[48px] w-[52px] shrink-0 place-items-center rounded-2xl border border-sky-100 bg-white text-slate-700 shadow-sm transition-all duration-150 hover:bg-sky-50 active:scale-90"
    >
      <EllipsisHorizontalIcon className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}
