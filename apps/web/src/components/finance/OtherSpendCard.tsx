'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import { expenseKindMeta, type ExpenseKind } from '@/lib/expense-kind';
import type { OtherSpendInsight } from '@/lib/other-spend';
import ExpenseDetailSheet from './ExpenseDetailSheet';
import { fmtMoneyFine } from './finance-ui';
import HistorialMensual from './HistorialMensual';
import AddTicketButton from './AddTicketButton';

interface Props {
  readonly other: OtherSpendInsight;
  /** Se tocó algo dentro de un tipo de gasto: el plan tiene que recalcularse. */
  readonly onChanged: () => void;
}

/**
 * Lo que se va fuera del super: comida, farmacia, gasolina, hogar.
 *
 * Es la mitad que faltaba del plan. Estos tickets se registraban igual que los
 * del super pero no aparecían en ninguna pantalla y no restaban en ningún
 * cálculo: el plan repartía entre metas un dinero ya gastado.
 *
 * Responde lo mismo que la de comida, para que las dos se lean igual: cuánto
 * llevas, a qué ritmo, en qué se va, cómo fueron los meses anteriores y qué
 * resta el plan. Sin límite —nadie se pone un tope de farmacia—: la
 * referencia del ritmo es tu propio promedio. Y sin proyecciones antes de que
 * signifiquen algo (el día 7, igual que en el super).
 */
export default function OtherSpendCard({ other: o, onChanged }: Props) {
  /** Tipo de gasto abierto en la hoja de detalle. null = ninguno. */
  const [openKind, setOpenKind] = useState<ExpenseKind | null>(null);

  if (!o.hasData) return null;

  const maxKind = Math.max(...o.byKind.map((k) => k.currentMonth), 1);
  // La escala del ritmo: lo que proyectas y tu promedio tienen que caber, con
  // un 10 % de aire para que la raya del promedio no quede pegada al borde
  // (donde no se ve) cuando es la cifra mayor.
  const escala = Math.max(o.projectedMonthEnd, o.avgMonthly, 1) * 1.1;
  const anchoDe = (n: number) => `${Math.min(100, (n / escala) * 100)}%`;
  const diferencia = o.projectedMonthEnd - o.avgMonthly;

  return (
    <section className="rounded-3xl border border-blue-100 bg-blue-50/60 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-black">
            🍔 Fuera del super
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {o.countThisMonth > 0
              ? `${o.countThisMonth} ${o.countThisMonth === 1 ? 'gasto' : 'gastos'} este mes que no son de despensa.`
              : 'Sin gastos de este tipo registrados este mes.'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-black text-black tabular-nums leading-none">
            {fmtMoneyFine(o.spentThisMonth)}
          </p>
          {/* La tendencia solo con dos meses cerrados: con uno se compara
              contra ruido, igual criterio que en el super. */}
          {o.trendPct !== null && o.monthsWithData >= 2 && Math.abs(o.trendPct) >= 10 && (
            <span
              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-black ${
                o.trendPct > 0 ? 'bg-blue-100 text-blue-700' : 'bg-sky-100 text-sky-700'
              }`}
            >
              {o.trendPct > 0 ? '↑' : '↓'} {Math.abs(Math.round(o.trendPct))}% vs tu promedio
            </span>
          )}
        </div>
      </div>

      {/* Ritmo del mes, como en la tarjeta de comida. La raya marca tu
          promedio: lo que la barra clara pase de ella es lo que este mes va
          por encima de lo normal. */}
      {o.paceIsMeaningful && (
        <div className="rounded-2xl bg-white/70 p-4 mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500">
              Ritmo del mes · día {o.daysElapsed} de {o.daysInMonth}
            </span>
            <span className="text-xs font-bold tabular-nums text-black">{fmtMoneyFine(o.dailyPace)}/día</span>
          </div>

          <div className="relative h-3.5 rounded-full bg-blue-100 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-blue-200"
              initial={{ width: 0 }}
              animate={{ width: anchoDe(o.projectedMonthEnd) }}
              transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
            />
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-sky-400 to-blue-400"
              initial={{ width: 0 }}
              animate={{ width: anchoDe(o.spentThisMonth) }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
            />
            {o.avgMonthly > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 bg-slate-700/60"
                style={{ left: anchoDe(o.avgMonthly) }}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div>
              <p className="text-[11px] text-slate-400 font-bold">Llevas</p>
              <p className="text-sm font-black text-black tabular-nums">{fmtMoneyFine(o.spentThisMonth)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-bold">Cerrarás en</p>
              <p className="text-sm font-black text-black tabular-nums">{fmtMoneyFine(o.projectedMonthEnd)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-bold">Tu promedio</p>
              <p className="text-sm font-black text-black tabular-nums">
                {o.avgMonthly > 0 ? fmtMoneyFine(o.avgMonthly) : '—'}
              </p>
            </div>
          </div>

          {o.avgMonthly > 0 && (
            <p className="text-xs mt-2.5 text-slate-700">
              {diferencia > 0
                ? `⚠️ A este ritmo cierras ${fmtMoneyFine(diferencia)} por encima de tu promedio.`
                : `✅ A este ritmo cierras ${fmtMoneyFine(-diferencia)} por debajo de tu promedio.`}
            </p>
          )}
        </div>
      )}

      {/* En qué se va. Cada fila abre sus tickets: ahí se corrigen, se borran
          y se añaden. El chevron es toda la instrucción que hace falta. */}
      {o.byKind.length > 0 && (
        <ul className="space-y-1">
          {o.byKind.map((k) => {
            const meta = expenseKindMeta(k.kind);
            return (
              <li key={k.kind}>
                <button
                  type="button"
                  onClick={() => { haptic(); setOpenKind(k.kind); }}
                  className="flex w-full items-center gap-2.5 rounded-xl -mx-1.5 px-1.5 py-1.5 text-left transition active:scale-[0.99] active:bg-white/70"
                >
                  <span className="text-base shrink-0" aria-hidden="true">{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 truncate">
                        {meta.groupLabel}
                        <span className="ml-1.5 font-normal text-slate-400">
                          {k.count} {k.count === 1 ? 'ticket' : 'tickets'}
                        </span>
                      </span>
                      <span className="text-xs font-black text-black tabular-nums shrink-0">
                        {fmtMoneyFine(k.currentMonth)}
                        {k.deltaPct !== null && Math.abs(k.deltaPct) >= 10 && (
                          <span className={`ml-1.5 font-bold ${k.deltaPct > 0 ? 'text-blue-700' : 'text-sky-700'}`}>
                            {k.deltaPct > 0 ? '+' : ''}{Math.round(k.deltaPct)}%
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="block h-1.5 rounded-full bg-white mt-1 overflow-hidden">
                      <motion.span
                        className="block h-full rounded-full bg-linear-to-r from-sky-300 to-blue-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${(k.currentMonth / maxKind) * 100}%` }}
                        transition={{ duration: 0.7 }}
                      />
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-slate-300 text-sm">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Dónde. Tres sitios como mucho: es un dato de contexto, no un informe. */}
      {o.topPlaces.length > 0 && (
        <p className="mt-3 text-[11px] text-slate-500">
          Sobre todo en{' '}
          {o.topPlaces.map((p, i) => (
            <span key={p.name}>
              {i > 0 && (i === o.topPlaces.length - 1 ? ' y ' : ', ')}
              <span className="font-bold text-slate-600">{p.name}</span> ({fmtMoneyFine(p.total)})
            </span>
          ))}
          .
        </p>
      )}

      {/* Cómo fueron los meses anteriores: el mismo gráfico que comida. */}
      <HistorialMensual history={o.history} tope={o.projectedMonthEnd} />

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-blue-100">
        {/* Lo que el plan hace con esto, dicho sin rodeos: es la única cifra de
            la tarjeta que afecta a las metas. */}
        <p className="text-[11px] text-slate-500 min-w-0">
          {o.baseline > 0
            ? <>El plan resta <span className="font-bold text-slate-700">{fmtMoneyFine(o.baseline)}</span> al mes por esto.</>
            : 'Todavía no resta nada por este concepto.'}
        </p>
        {/* «Otro» y no «Comida»: esta tarjeta agrupa comida fuera, farmacia,
            gasolina y hogar, así que adivinar cuál sería etiquetar mal el
            ticket cuando el detector no reconozca la tienda. Lo que sí queda
            decidido es lo que el usuario pidió: esto no es despensa. */}
        <AddTicketButton kind="other" />
      </div>

      {openKind !== null && (
        <ExpenseDetailSheet
          expenseKind={openKind}
          onClose={() => setOpenKind(null)}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
