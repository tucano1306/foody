'use client';

import { fmtMoney, SPLIT_INTEREST, SPLIT_PRINCIPAL } from './debt-ui';

interface Props {
  readonly interest: number;
  readonly principal: number;
  readonly currency?: string;
  /** Compacta: solo la barra, sin las etiquetas de abajo. */
  readonly compact?: boolean;
}

/**
 * La barra de reparto: de cada cuota, cuánto se lleva el banco y cuánto baja la
 * deuda de verdad.
 *
 * Es el componente central de toda la sección. Explica la lógica de un crédito
 * —que pagar no es lo mismo que amortizar— sin una sola línea de instrucciones:
 * el ancho de cada bloque lo dice todo, y cuando el azul oscuro se come la barra
 * el usuario entiende el problema antes de leer nada.
 */
export default function SplitBar({ interest, principal, currency = 'USD', compact = false }: Props) {
  const total = interest + principal;
  const interestPct = total > 0 ? (interest / total) * 100 : 0;
  const principalPct = total > 0 ? 100 - interestPct : 0;

  return (
    <div className="w-full">
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-sky-100"
        role="img"
        aria-label={`De ${fmtMoney(total, currency)}: ${fmtMoney(interest, currency)} de interés y ${fmtMoney(principal, currency)} a capital`}
      >
        {/* El ancho va en `style` y se anima con una transición CSS, no con un
            `initial` de framer: así el reparto correcto está pintado desde el
            primer fotograma —incluso si la animación no llega a correr— y
            además fluye al recalcularse mientras el usuario teclea el monto. */}
        <div
          className="transition-[width] duration-500 ease-out"
          style={{ width: `${interestPct}%`, backgroundColor: SPLIT_INTEREST }}
        />
        <div
          className="transition-[width] duration-500 ease-out"
          style={{ width: `${principalPct}%`, backgroundColor: SPLIT_PRINCIPAL }}
        />
      </div>

      {!compact && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: SPLIT_INTEREST }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 leading-tight">Interés</p>
              <p className="text-sm font-extrabold text-black leading-tight">
                {fmtMoney(interest, currency)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: SPLIT_PRINCIPAL }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 leading-tight">Baja tu deuda</p>
              <p className="text-sm font-extrabold text-black leading-tight">
                {fmtMoney(principal, currency)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
