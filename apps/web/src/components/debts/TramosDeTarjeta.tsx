'use client';

import { enPromocion } from '@/lib/card-payment';
import type { TipoDePromo } from '@/lib/condiciones-credito';
import { toDateKey, type RatePeriod } from '@/lib/debt-engine';
import { avisoDePromo } from '@/lib/debt-promo';
import PromoAviso from './PromoAviso';
import { fmtDateFull, fmtRate } from './debt-ui';

/** Lo que hace falta de un tramo para pintarlo en la bandeja. */
export interface TramoEnBandeja {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly currency: string;
  readonly rate: number;
  readonly ratePeriod: RatePeriod;
  readonly promoEndsOn: string | null;
  readonly rateAfterPromo: number | null;
  readonly promoKind?: TipoDePromo | null;
  readonly deferredInterest?: number | null;
  readonly openedAt?: string | null;
}

interface Props {
  /** El título de la tarjeta: nombra la lista para un lector de pantalla. */
  readonly titulo: string;
  /** Ya en el orden en que se quieren ver. */
  readonly tramos: readonly TramoEnBandeja[];
  /**
   * Cada pantalla escribe el saldo a su manera —Deudas con centavos siempre,
   * el Plan sin ellos cuando son cero— y aquí no se decide eso.
   */
  readonly formatoSaldo: (t: TramoEnBandeja) => string;
  readonly onOpen: (id: string) => void;
  /** El tramo que se está abriendo, si alguno: dice «Abriendo…» en su lugar. */
  readonly abriendo?: string | null;
  readonly disabled?: boolean;
}

/**
 * Los saldos de UNA tarjeta, en una bandeja hundida con líneas entre ellos.
 *
 * Antes cada tramo era una caja redondeada propia, del mismo tono que la
 * tarjeta que lo contenía; en el Plan, además, del mismo tono que las
 * tarjetas vecinas. «Compras 3650» se leía como una tarjeta más, y no se veía
 * dónde acababa una y empezaba la siguiente. En oscuro era literal: el fondo
 * de la tarjeta y el de sus tramos resolvían al mismo `--surface`.
 *
 * Ahora los tramos comparten un solo fondo (`surface-2`, un escalón más hondo
 * que la tarjeta en los dos temas) y se separan con una línea, como filas de
 * una misma lista. La única caja con cabecera y sello es la tarjeta.
 *
 * La comparten Deudas y el Plan para que las dos pantallas no se separen.
 */
export default function TramosDeTarjeta({ titulo, tramos, formatoSaldo, onOpen, abriendo = null, disabled = false }: Props) {
  const hoy = toDateKey(new Date());
  return (
    <ul
      aria-label={`Saldos de ${titulo}`}
      className="surface-2 divide-y divide-[var(--line-strong)] overflow-hidden rounded-2xl"
    >
      {tramos.map((t) => {
        const promoViva = enPromocion(t, hoy);
        const aviso = avisoDePromo({ ...t, currentBalance: t.balance }, hoy);
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              disabled={disabled}
              className="flex w-full flex-col gap-1.5 px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-3)] active:bg-[var(--surface-3)] disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-black">{t.name}</span>
                <span className="shrink-0 text-sm font-extrabold tabular-nums text-black">{formatoSaldo(t)}</span>
                <span aria-hidden="true" className="shrink-0 text-sm text-slate-400">›</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                {abriendo === t.id ? (
                  <span className="text-slate-500">Abriendo…</span>
                ) : promoViva ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-sky-700">
                    0 % hasta el {fmtDateFull(t.promoEndsOn)}
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">
                    {t.promoEndsOn && t.rateAfterPromo != null
                      ? fmtRate(t.rateAfterPromo, 'annual_nominal')
                      : fmtRate(t.rate, t.ratePeriod)}
                  </span>
                )}
              </span>
              {aviso && <PromoAviso aviso={aviso} currency={t.currency} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
