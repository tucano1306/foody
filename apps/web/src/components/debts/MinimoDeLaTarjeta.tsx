'use client';

import type { CardStatementInfo, DebtWithProjection } from '@/lib/debt-data';
import { tasaVigente } from '@/lib/card-payment';
import { costoDelAtraso, type CondicionesDeCredito } from '@/lib/condiciones-credito';
import { estadoDelMinimo } from '@/lib/cuadre-tarjeta';
import { toDateKey } from '@/lib/debt-engine';
import { fmtDateFull, fmtMoney } from './debt-ui';

interface Props {
  readonly tramos: readonly DebtWithProjection[];
  readonly estado: CardStatementInfo | null;
  readonly condiciones: CondicionesDeCredito | null;
}

/** Días hasta una fecha YYYY-MM-DD, contando en el calendario del dispositivo. */
function diasHasta(clave: string, hoy: string): number {
  const [y1, m1, d1] = hoy.split('-').map(Number);
  const [y2, m2, d2] = clave.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * El mínimo del estado, a la vista: cuánto y cuándo, y si ya está. Es la
 * pregunta de cada mes con una tarjeta de tramos, y la respuesta estaba en un
 * PDF. Lo comparten la tarjeta de la lista y su hoja, para que digan lo mismo.
 */
export default function MinimoDeLaTarjeta({ tramos, estado, condiciones }: Props) {
  const cobertura = estadoDelMinimo(estado);
  if (!estado || !cobertura) return null;

  const hoy = toDateKey(new Date());
  const currency = tramos[0]?.currency ?? 'USD';
  const venceEn = estado.dueDate ? diasHasta(estado.dueDate, hoy) : null;
  // Lo que cuesta no llegar, solo con el mínimo pendiente y a una semana o
  // menos del vencimiento (o ya pasado): antes, sería ruido en cada visita.
  const atraso =
    condiciones && !cobertura.cubierto && venceEn !== null && venceEn <= 7
      ? costoDelAtraso(
          condiciones,
          tramos.map((t) => ({ balance: t.currentBalance, apr: tasaVigente({ ...t, balance: t.currentBalance }, hoy) * 1200 })),
        )
      : null;

  return (
    <div className="flex flex-col gap-2">
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

      {atraso && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[11px] font-semibold leading-snug text-amber-950">
          ⚠️ {venceEn !== null && venceEn < 0 ? 'Venció sin cubrir' : 'Si no llega a tiempo'}:
          {atraso.cargo != null && <> cargo de <strong>{fmtMoney(atraso.cargo, currency)}</strong></>}
          {atraso.cargo != null && atraso.tasaPenal != null && ' y'}
          {atraso.tasaPenal != null && <> la tasa puede subir al <strong>{atraso.tasaPenal} %</strong></>}
        </p>
      )}
    </div>
  );
}
