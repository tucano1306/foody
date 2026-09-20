'use client';

import type { CashFlow, HealthBreakdown } from '@/lib/finance-engine';
import ModalShell from './ModalShell';
import { HEALTH_TIERS, LABEL, NUM, fmtMoney, healthColor, healthLabel } from './finance-ui';

interface Props {
  readonly breakdown: HealthBreakdown;
  readonly cash: CashFlow;
  /**
   * Si las cifras que se están explicando incluyen el negocio.
   * `null` cuando no hay nada marcado como negocio y la pregunta no existe.
   */
  readonly businessIncluded: boolean | null;
  readonly onClose: () => void;
}

const MES = new Intl.DateTimeFormat('es', { month: 'long' });

/**
 * Qué hay detrás del número del anillo.
 *
 * «71 · salud · Saludable» era un veredicto sin juicio: no decía qué mira, de
 * qué periodo habla ni qué habría que mover para subirlo. Peor: se leía como
 * una nota histórica de la persona, cuando solo mira el mes en curso y se
 * recalcula entera con cada dato nuevo.
 *
 * El desglose lo produce `explainHealthScore`, el mismo código que calcula la
 * nota, así que lo que se lee aquí no puede contradecir al anillo. Los puntos
 * de las tres partes suman exactamente la nota, a propósito: es la cuenta
 * completa, no un resumen aproximado.
 */
export default function HealthDetailSheet({ breakdown, cash, businessIncluded, onClose }: Props) {
  const { score, parts, hasIncome } = breakdown;
  const tier = [...HEALTH_TIERS].reverse().find((t) => score >= t.min) ?? HEALTH_TIERS[0];
  const color = healthColor(score);
  const mes = MES.format(new Date());
  /** El siguiente escalón, para decir cuánto falta y no solo dónde está. */
  const next = HEALTH_TIERS.find((t) => t.min > score);

  return (
    <ModalShell
      emoji="💙"
      title="Salud financiera"
      subtitle={`De dónde sale tu ${score} de 100`}
      onClose={onClose}
    >
      {/* ── La nota, situada en su escala ──────────────────────────────── */}
      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-[5px] bg-sky-50"
            style={{ borderColor: color }}
          >
            <span className={`text-xl font-black tabular-nums leading-none ${NUM}`}>{score}</span>
            <span className="text-[9px] font-bold text-slate-500">de 100</span>
          </span>
          <div className="min-w-0">
            <p className={`text-xl font-black leading-tight ${NUM}`}>{healthLabel(score)}</p>
            <p className={`text-xs ${LABEL}`}>
              {hasIncome ? tier.meaning : 'Sin ingresos cargados no hay nota que calcular.'}
            </p>
          </div>
        </div>

        {/* La escala entera: dónde está y qué hay al lado. */}
        <div className="mt-4">
          <div className="h-2.5 overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(score, 2)}%`, backgroundColor: color }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-bold text-slate-500">
            {HEALTH_TIERS.map((t) => (
              <span key={t.label} className={hasIncome && t.label === tier.label ? 'text-black' : ''}>
                {t.min}+ {t.label}
              </span>
            ))}
          </div>
        </div>

        {hasIncome && next && (
          <p className="mt-3 text-[11px] text-slate-500">
            Te faltan <span className={`font-black tabular-nums ${NUM}`}>{next.min - score}</span> puntos
            para «{next.label}».
          </p>
        )}
      </div>

      {/* ── El periodo, que es la duda de fondo ────────────────────────── */}
      <p className={`mt-3 px-1 text-xs leading-relaxed ${LABEL}`}>
        Mira <span className="font-black text-black">solo el mes en curso</span> — {mes} —: lo que entra
        este mes, lo que llevas vencido hasta hoy y el ritmo que hoy llevan tus metas. No es un promedio
        del año ni guarda histórico: cambia en cuanto cambias un dato.
      </p>

      {/* ── Las tres partes ────────────────────────────────────────────── */}
      <div className="mt-3 space-y-2.5">
        {parts.map((part) => (
          <div key={part.key} className="rounded-2xl bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-black text-slate-800">
                <span aria-hidden="true">{part.emoji}</span> {part.label}
              </span>
              <span className={`shrink-0 text-sm font-black tabular-nums ${NUM}`}>
                {part.points}
                <span className="text-[11px] font-bold text-slate-400"> / {part.maxPoints} pts</span>
              </span>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-sky-400"
                style={{ width: `${Math.round(part.ratio * 100)}%` }}
              />
            </div>

            <p className="mt-2 text-xs text-slate-700">{part.detail}</p>
            {part.hint && <p className="mt-1 text-[11px] text-slate-500">{part.hint}</p>}
          </div>
        ))}
      </div>

      <p className="mt-2 px-1 text-[11px] text-slate-500">
        Las tres partes suman la nota: 40 puntos el margen libre, 30 lo vencido y 30 las metas.
      </p>

      {/* ── Las dos cifras que acompañan al anillo ─────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-2xl bg-white">
        <div className="border-b border-sky-100 bg-sky-50/70 px-4 py-2.5 text-xs font-black text-slate-600">
          🔢 Las dos cifras de la cabecera
        </div>
        <div className="space-y-3 px-4 py-3.5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-slate-800">
                {cash.oneTimeIncome > 0 ? 'Entra este mes' : 'Ingreso'}
              </span>
              <span className={`text-sm font-black tabular-nums ${NUM}`}>{fmtMoney(cash.monthlyIncome)}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {cash.oneTimeIncome > 0
                ? `${fmtMoney(cash.recurringIncome)} que se repiten cada mes + ${fmtMoney(cash.oneTimeIncome)} de cobros sueltos que cayeron en ${mes}.`
                : 'Lo que se repite cada mes. Los cobros sueltos se contarían aparte.'}
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-slate-800">Libre al mes</span>
              <span className={`text-sm font-black tabular-nums ${NUM}`}>{fmtMoney(cash.available)}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Lo que entra menos pagos fijos ({fmtMoney(cash.fixedPayments)}), súper (
              {fmtMoney(cash.groceriesEstimate)}), gasto fuera del súper ({fmtMoney(cash.otherExpenses)}) y
              cuotas de crédito ({fmtMoney(cash.creditPayments)}). El desglose completo está justo debajo,
              en «Tu mes».
            </p>
          </div>
        </div>
      </div>

      {/* Con negocio, la misma nota vale dos cifras distintas: hay que decir
          cuál de las dos se está leyendo. */}
      {businessIncluded !== null && (
        <p className="mt-3 px-1 text-[11px] text-slate-500">
          {businessIncluded
            ? '🏢 Estas cifras incluyen lo que factura y gasta el negocio. Apaga el interruptor de la cabecera para ver solo tu dinero personal.'
            : '🏠 Estas cifras son solo de tu dinero personal. El interruptor de la cabecera mete el negocio y la nota cambia.'}
        </p>
      )}
    </ModalShell>
  );
}
