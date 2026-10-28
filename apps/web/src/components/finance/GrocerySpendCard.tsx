'use client';

import { motion } from 'framer-motion';
import type { GroceryInsight, MonthTotal } from '@/lib/grocery-insights';
import { fmtMoneyFine } from './finance-ui';
import HistorialMensual from './HistorialMensual';
import AddTicketButton from './AddTicketButton';

interface Props {
  readonly groceries: GroceryInsight;
  readonly history: readonly MonthTotal[];
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «septiembre», para el título: el usuario pregunta por ESTE mes. */
function mesLargo(d: Date): string {
  try {
    return new Intl.DateTimeFormat('es-MX', { month: 'long' }).format(d);
  } catch {
    return MONTHS_SHORT[d.getMonth()] ?? '';
  }
}

/**
 * Cómo tus compras reales afectan al plan: el ritmo del mes contra el límite,
 * la tendencia frente a tu promedio y en qué se está yendo el dinero.
 */
export default function GrocerySpendCard({ groceries: g, history }: Props) {
  if (g.baselineSource === 'none') return null;

  const overLimit = g.limit > 0 && g.overLimit > 0;
  const paceWidth = g.limit > 0 ? Math.min(100, (g.projectedMonthEnd / g.limit) * 100) : 100;
  const spentWidth = g.limit > 0 ? Math.min(100, (g.spentThisMonth / g.limit) * 100) : 0;
  const mesEnCurso = mesLargo(new Date());

  return (
    <section className="rounded-3xl border border-sky-100 bg-sky-50/70 shadow-sm p-5">
      {/* La cabecera dice UNA cosa, grande: cuánto llevas de comida este mes.
          El desglose por categoría vivía debajo y se fue a Estadísticas — el
          plan responde «cuánto me queda para mis metas», no «en qué se me fue».
          Lo que el plan resta es un detalle del plan y vive en el pie, que es
          donde el usuario pregunta por él. */}
      <div className="mb-4">
        {/* El título entero en su línea: con el chip al lado se partía en
            «Gastos en comida ·» / «septiembre». */}
        <h2 className="text-sm font-black text-black">
          🛒 Gastos en comida <span className="text-slate-500 font-bold">· {mesEnCurso}</span>
        </h2>

        {/* El chip va junto a la cifra, que es a lo que se refiere. */}
        <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
          <p className="text-4xl font-black text-black tabular-nums leading-none whitespace-nowrap">
            {fmtMoneyFine(g.spentThisMonth)}
          </p>
          {/* Mismo criterio que el consejero: con un solo mes cerrado —o con el
              mes recién empezado— el porcentaje compara contra ruido. La
              etiqueta dice contra QUÉ compara: un "↑109%" suelto encima de
              "vas por debajo del límite" parecían contradecirse. */}
          {g.paceIsMeaningful && g.trendPct !== null && g.monthsWithData >= 2 && Math.abs(g.trendPct) >= 5 && (
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                g.trendPct > 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              {g.trendPct > 0 ? '↑' : '↓'} {Math.abs(Math.round(g.trendPct))}% vs tu promedio
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-2">
          {g.tripsThisMonth > 0
            ? `${g.tripsThisMonth} ${g.tripsThisMonth === 1 ? 'compra' : 'compras'} de despensa registradas.`
            : 'Sin compras de despensa registradas todavía.'}
        </p>
      </div>

      {/* Ritmo del mes — solo cuando ya significa algo. Al arrancar el mes, sin
          compras todavía, mostraba "cerrarás en $0" y "vas $500 por debajo del
          límite", que es ruido disfrazado de dato. */}
      {!g.paceIsMeaningful ? (
        <div className="rounded-2xl bg-white/70 p-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">🧾</span>
          <p className="text-sm text-slate-600">
            {g.spentThisMonth > 0
              ? `Llevas ${fmtMoneyFine(g.spentThisMonth)} este mes.`
              : 'Aún no hay compras este mes.'}
          </p>
        </div>
      ) : (
      <div className="rounded-2xl bg-white/70 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-500">
            Ritmo del mes · día {g.daysElapsed} de {g.daysInMonth}
          </span>
          <span className="text-xs font-bold tabular-nums text-black">
            {fmtMoneyFine(g.dailyPace)}/día
          </span>
        </div>

        <div className="relative h-3.5 rounded-full bg-sky-100 overflow-hidden">
          {/* Proyección al cierre (translúcida) sobre lo ya gastado (sólida) */}
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${overLimit ? 'bg-blue-200' : 'bg-sky-200'}`}
            initial={{ width: 0 }}
            animate={{ width: `${paceWidth}%` }}
            transition={{ duration: 0.9, ease: [0.22, 0.61, 0.36, 1] }}
          />
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full bg-linear-to-r ${overLimit ? 'from-blue-500 to-blue-400' : 'from-sky-400 to-blue-400'}`}
            initial={{ width: 0 }}
            animate={{ width: `${g.limit > 0 ? spentWidth : 100}%` }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div>
            <p className="text-[11px] text-slate-400 font-bold">Llevas</p>
            <p className="text-sm font-black text-black tabular-nums">{fmtMoneyFine(g.spentThisMonth)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold">Cerrarás en</p>
            <p className="text-sm font-black tabular-nums text-black">
              {fmtMoneyFine(g.projectedMonthEnd)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-bold">
              {g.limit > 0 ? 'Tu límite' : 'Tu promedio'}
            </p>
            <p className="text-sm font-black text-black tabular-nums">
              {fmtMoneyFine(g.limit > 0 ? g.limit : g.avgMonthly)}
            </p>
          </div>
        </div>

        {g.limit > 0 && (
          <p className="text-xs mt-2.5 text-slate-700">
            {overLimit
              ? `⚠️ A este ritmo te pasas ${fmtMoneyFine(g.overLimit)} — ese dinero deja de ir a tus metas.`
              : `✅ Vas ${fmtMoneyFine(Math.abs(g.overLimit))} por debajo del límite: es dinero libre para tus metas.`}
          </p>
        )}
      </div>
      )}

      {/* Historial: el mismo gráfico que «Fuera del super». */}
      <HistorialMensual history={history} tope={g.projectedMonthEnd} />


      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-sky-100">
        {/* La conexión con el plan, en una línea y al final: es la respuesta a
            "¿y esto qué tiene que ver con mis metas?", no la portada. */}
        <p className="text-[11px] text-slate-500 min-w-0">
          {g.baselineSource === 'limit'
            ? <>Sin compras aún: el plan usa tu límite de <span className="font-bold text-slate-700">{fmtMoneyFine(g.baseline)}</span>.</>
            : <>El plan resta <span className="font-bold text-slate-700">{fmtMoneyFine(g.baseline)}</span> al mes de super
                {g.baselineSource === 'average' ? ', tu promedio real.' : ', según tus tickets.'}</>}
        </p>
        <AddTicketButton />
      </div>
    </section>
  );
}
