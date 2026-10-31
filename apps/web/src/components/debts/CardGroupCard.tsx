'use client';

import type { CardStatementInfo, DebtWithProjection } from '@/lib/debt-data';
import { cardTitle, enPromocion } from '@/lib/card-payment';
import { estadoDelMinimo } from '@/lib/cuadre-tarjeta';
import { toDateKey } from '@/lib/debt-engine';
import { avisoDePromo } from '@/lib/debt-promo';
import { haptic } from '@/lib/haptic';
import PromoAviso from './PromoAviso';
import { BTN_PRIMARY, fmtDateFull, fmtMoney, fmtMoneyShort, fmtRate } from './debt-ui';

interface Props {
  /** Los tramos de la tarjeta, ya filtrados por ámbito. */
  readonly tramos: readonly DebtWithProjection[];
  readonly onOpenTramo: (id: string) => void;
  readonly onPay: () => void;
  /** El último estado de cuenta guardado de esta tarjeta. */
  readonly estado?: CardStatementInfo | null;
  readonly onCuadrar?: () => void;
}

/** Días hasta una fecha YYYY-MM-DD, contando en el calendario del dispositivo. */
function diasHasta(clave: string, hoy: string): number {
  const [y1, m1, d1] = hoy.split('-').map(Number);
  const [y2, m2, d2] = clave.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Una tarjeta con varios tramos: el plástico arriba, sus saldos dentro.
 *
 * Antes cada tramo era una tarjeta suelta en la lista, y nada decía que
 * «Compras 3650» y «Unlimited Cash 3650» se pagan con el mismo mínimo. Ahora
 * se ven juntas, cada una con su tasa, y el abono se hace a la tarjeta.
 */
export default function CardGroupCard({ tramos, onOpenTramo, onPay, estado = null, onCuadrar }: Props) {
  const hoy = toDateKey(new Date());
  const currency = tramos[0]?.currency ?? 'USD';
  const total = tramos.reduce((s, t) => s + t.currentBalance, 0);
  const interesMes = tramos.reduce((s, t) => s + t.projection.monthlyInterest, 0);
  const ordenados = [...tramos].sort((a, b) => b.currentBalance - a.currentBalance);
  const cobertura = estadoDelMinimo(estado);
  const venceEn = estado?.dueDate ? diasHasta(estado.dueDate, hoy) : null;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-sky-100 bg-white p-5 shadow-sm sm:col-span-2">
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none" aria-hidden="true">💳</span>
        <div className="min-w-0 flex-1">
          {/* Sin `truncate`: a 375px cortaba en «Bank of Ame…» y se perdía justo
              lo que distingue la tarjeta, los últimos dígitos. */}
          <p className="text-base font-bold leading-tight text-black">{cardTitle(tramos)}</p>
          <p className="text-xs text-slate-500">
            {tramos.length} tramos · un solo mínimo
            {interesMes > 0 && <> · {fmtMoney(interesMes, currency)} de interés al mes</>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-extrabold leading-tight text-black">{fmtMoneyShort(total, currency)}</p>
          <p className="text-[11px] text-slate-400">debes hoy</p>
        </div>
      </div>

      {/* El mínimo del estado, a la vista: cuánto y cuándo, y si ya está.
          Es la pregunta de cada mes con esta tarjeta, y la respuesta estaba
          en un PDF. */}
      {estado && cobertura && (
        <div
          className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 ${
            cobertura.cubierto ? 'bg-sky-50/70' : 'border border-blue-200 bg-blue-50'
          }`}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-slate-600">
              Mínimo del estado{estado.dueDate ? ` · vence el ${fmtDateFull(estado.dueDate)}` : ''}
            </span>
            <span className="block text-base font-extrabold text-black">{fmtMoney(estado.minimumDue, currency)}</span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              cobertura.cubierto ? 'bg-white text-sky-700' : 'bg-blue-100 text-blue-800'
            }`}
          >
            {cobertura.cubierto
              ? '✓ Cubierto'
              : venceEn !== null && venceEn >= 0
                ? `Faltan ${fmtMoney(cobertura.falta, currency)} · ${venceEn === 0 ? 'hoy' : `en ${venceEn} ${venceEn === 1 ? 'día' : 'días'}`}`
                : `Faltan ${fmtMoney(cobertura.falta, currency)}`}
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {ordenados.map((t) => {
          const promoViva = enPromocion(t, hoy);
          const aviso = avisoDePromo(t, hoy);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  haptic();
                  onOpenTramo(t.id);
                }}
                className="flex w-full flex-col gap-1 rounded-2xl bg-sky-50/70 px-3.5 py-3 text-left transition active:scale-[0.99]"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-black">{t.name}</span>
                  <span className="shrink-0 text-sm font-extrabold text-black">
                    {fmtMoney(t.currentBalance, t.currency)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                  {promoViva ? (
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

      <button
        type="button"
        onClick={() => {
          haptic();
          onPay();
        }}
        className={`rounded-2xl py-3.5 text-sm ${BTN_PRIMARY}`}
      >
        💸 Abonar a la tarjeta
      </button>
      {onCuadrar && (
        <button
          type="button"
          onClick={() => {
            haptic();
            onCuadrar();
          }}
          className="-mt-2 rounded-2xl py-2.5 text-xs font-bold text-slate-600 transition hover:bg-sky-50 active:scale-[0.99]"
        >
          🧾 {estado ? 'Cuadrar con el nuevo estado de cuenta' : 'Cuadrar con el estado de cuenta'}
        </button>
      )}
    </div>
  );
}
