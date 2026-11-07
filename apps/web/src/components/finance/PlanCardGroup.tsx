'use client';

import type { CardStatementInfo } from '@/lib/debt-data';
import { cardTitle, ultimosDeLaTarjeta } from '@/lib/card-payment';
import { estadoDelMinimo } from '@/lib/cuadre-tarjeta';
import { toDateKey, type RatePeriod } from '@/lib/debt-engine';
import type { TipoDePromo } from '@/lib/condiciones-credito';
import { haptic } from '@/lib/haptic';
import ChipDeCuenta from '@/components/debts/ChipDeCuenta';
import TramosDeTarjeta from '@/components/debts/TramosDeTarjeta';
import { fmtDateFull } from '@/components/debts/debt-ui';
import { fmtMoneyFine } from './finance-ui';

/** Un tramo tal como lo tiene el plan: su resumen más lo que hace falta para pintarlo. */
export interface TramoDelPlan {
  readonly id: string;
  readonly name: string;
  readonly balance: number;
  readonly installment: number;
  readonly monthlyInterest: number;
  readonly countedInPayments: boolean;
  readonly issuer: string | null;
  readonly accountLast4: string | null;
  readonly currency: string;
  readonly rate: number;
  readonly ratePeriod: RatePeriod;
  readonly promoEndsOn: string | null;
  readonly rateAfterPromo: number | null;
  readonly promoKind: TipoDePromo;
  readonly deferredInterest: number | null;
  readonly openedAt: string | null;
}

interface Props {
  readonly tramos: readonly TramoDelPlan[];
  readonly estado: CardStatementInfo | null;
  /** Lo que se está abriendo: el id de un tramo o el grupo de la tarjeta. */
  readonly loadingId: string | null;
  readonly grupo: string;
  readonly onOpenTramo: (id: string) => void;
  readonly onPay: () => void;
  readonly onCuadrar: () => void;
}

/** Días hasta una fecha YYYY-MM-DD, en el calendario del dispositivo. */
function diasHasta(clave: string, hoy: string): number {
  const [y1, m1, d1] = hoy.split('-').map(Number);
  const [y2, m2, d2] = clave.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Una tarjeta con tramos en el Plan, igual que en Deudas: el total de la
 * tarjeta, el mínimo del estado con su vencimiento, cada saldo con su tasa y
 * el aviso del 0 % que se acaba. Antes el plan listaba los tramos sueltos y
 * las dos pantallas no parecían hablar de la misma tarjeta.
 *
 * Además enseña lo que solo el plan sabe: cuánto aparta al mes para ella.
 */
export default function PlanCardGroup({ tramos, estado, loadingId, grupo, onOpenTramo, onPay, onCuadrar }: Props) {
  const hoy = toDateKey(new Date());
  const titulo = cardTitle(tramos.map((t) => ({ name: t.name, issuer: t.issuer, accountLast4: t.accountLast4 })));
  const total = tramos.reduce((s, t) => s + t.balance, 0);
  const interes = tramos.reduce((s, t) => s + t.monthlyInterest, 0);
  const cuota = tramos.filter((t) => !t.countedInPayments).reduce((s, t) => s + t.installment, 0);
  const ordenados = [...tramos].sort((a, b) => b.balance - a.balance);
  const cobertura = estadoDelMinimo(estado);
  const venceEn = estado?.dueDate ? diasHasta(estado.dueDate, hoy) : null;
  const ocupado = loadingId !== null;

  return (
    // `card` y no `bg-white/70`: el blanco translúcido sobre la lavanda de la
    // sección, sin borde, dejaba las tarjetas sin contorno y pegadas a la
    // vecina; en oscuro, además, del mismo `--surface` que sus tramos.
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <ChipDeCuenta ultimos={ultimosDeLaTarjeta(tramos)} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-tight text-black">{titulo}</span>
          <span className="block text-[11px] text-slate-500">{tramos.length} saldos · un solo mínimo</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-black tabular-nums text-black">{fmtMoneyFine(Math.round(total * 100) / 100)}</span>
          {interes > 0 && (
            <span className="block text-[11px] font-semibold text-blue-700">+{fmtMoneyFine(Math.round(interes * 100) / 100)} interés</span>
          )}
        </span>
      </div>

      {estado && cobertura && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
            cobertura.cubierto ? 'bg-sky-50' : 'border border-blue-200 bg-blue-50'
          }`}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-slate-600">
              Mínimo del estado{estado.dueDate ? ` · vence el ${fmtDateFull(estado.dueDate)}` : ''}
            </span>
            <span className="block text-sm font-black tabular-nums text-black">{fmtMoneyFine(estado.minimumDue)}</span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              cobertura.cubierto ? 'bg-white text-sky-700' : 'bg-blue-100 text-blue-800'
            }`}
          >
            {cobertura.cubierto
              ? '✓ Cubierto'
              : venceEn !== null && venceEn >= 0
                ? `Faltan ${fmtMoneyFine(cobertura.falta)} · ${venceEn === 0 ? 'hoy' : `en ${venceEn} ${venceEn === 1 ? 'día' : 'días'}`}`
                : `Faltan ${fmtMoneyFine(cobertura.falta)}`}
          </span>
        </div>
      )}

      <TramosDeTarjeta
        titulo={titulo}
        tramos={ordenados}
        formatoSaldo={(t) => fmtMoneyFine(t.balance)}
        onOpen={onOpenTramo}
        abriendo={loadingId}
        disabled={ocupado}
      />

      {/* Lo que el plan aparta al mes para la tarjeta: la suma de lo que pide
          cada tramo con la estrategia que tiene en Deudas. Al lado del mínimo
          del estado se ve la distancia entre «lo que exige el banco» y «lo que
          hace falta para el plan». */}
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[11px] font-bold text-slate-500">Tu plan aparta</span>
        <span className="text-sm font-black tabular-nums text-black">
          {fmtMoneyFine(Math.round(cuota * 100) / 100)}
          <span className="text-xs font-medium text-slate-400">/mes</span>
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { haptic(10); onPay(); }}
          disabled={ocupado}
          className="flex-[2] rounded-xl bg-blue-500 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 hover:bg-blue-600 disabled:opacity-60"
        >
          {loadingId === grupo ? 'Abriendo…' : '💸 Abonar a la tarjeta'}
        </button>
        <button
          type="button"
          onClick={() => { haptic(8); onCuadrar(); }}
          disabled={ocupado}
          aria-label="Cuadrar con el estado de cuenta"
          className="flex-1 rounded-xl bg-white py-2.5 text-xs font-bold text-slate-700 ring-1 ring-sky-200 transition active:scale-95 hover:bg-sky-50 disabled:opacity-60"
        >
          🧾 Cuadrar
        </button>
      </div>
    </div>
  );
}
