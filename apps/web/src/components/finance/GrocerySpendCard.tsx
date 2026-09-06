'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import { CATEGORY_EMOJI } from '@/lib/categories';
import type { GroceryInsight, MonthTotal } from '@/lib/grocery-insights';
import CategoryDetailSheet from './CategoryDetailSheet';
import { fmtMoney, fmtMoneyFine } from './finance-ui';
import ScanTicketButton from './ScanTicketButton';

interface Props {
  readonly groceries: GroceryInsight;
  readonly history: readonly MonthTotal[];
  /** Se tocó algo dentro de una categoría: el plan tiene que recalcularse. */
  readonly onChanged: () => void;
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function monthLabel(key: string): string {
  const m = Number(key.split('-')[1]);
  return MONTHS_SHORT[m - 1] ?? key;
}

function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI[name.toLowerCase()] ?? '🛒';
}

/**
 * Cómo tus compras reales afectan al plan: el ritmo del mes contra el límite,
 * la tendencia frente a tu promedio y en qué se está yendo el dinero.
 */
export default function GrocerySpendCard({ groceries: g, history, onChanged }: Props) {
  /** Categoría abierta en la hoja de detalle. null = ninguna. */
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  if (g.baselineSource === 'none') return null;

  const overLimit = g.limit > 0 && g.overLimit > 0;
  const paceWidth = g.limit > 0 ? Math.min(100, (g.projectedMonthEnd / g.limit) * 100) : 100;
  const spentWidth = g.limit > 0 ? Math.min(100, (g.spentThisMonth / g.limit) * 100) : 0;
  const maxMonth = Math.max(...history.map((h) => h.total), g.projectedMonthEnd, 1);

  return (
    <section className="rounded-3xl border border-sky-100 bg-sky-50/70 shadow-sm p-5">
      {/* La cabecera dice UNA cosa: cuánto llevas de super este mes.
          Antes abría con "el plan resta $274" mientras el cuerpo mostraba
          $104, $459 y $500 — cuatro cifras distintas sin decir cuál era cuál.
          Lo que el plan resta es un detalle del plan y ahora vive en el pie,
          que es donde el usuario pregunta por él. */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-black text-black">
            🛒 Tu super este mes
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {g.tripsThisMonth > 0
              ? `${g.tripsThisMonth} ${g.tripsThisMonth === 1 ? 'compra' : 'compras'} de despensa registradas.`
              : 'Sin compras de despensa registradas todavía.'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-black text-black tabular-nums leading-none">
            {fmtMoneyFine(g.spentThisMonth)}
          </p>
          {/* Mismo criterio que el consejero: con un solo mes cerrado —o con el
              mes recién empezado— el porcentaje compara contra ruido. La
              etiqueta dice contra QUÉ compara: un "↑109%" suelto encima de
              "vas por debajo del límite" parecían contradecirse. */}
          {g.paceIsMeaningful && g.trendPct !== null && g.monthsWithData >= 2 && Math.abs(g.trendPct) >= 5 && (
            <span
              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-black ${
                g.trendPct > 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              {g.trendPct > 0 ? '↑' : '↓'} {Math.abs(Math.round(g.trendPct))}% vs tu promedio
            </span>
          )}
        </div>
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

      {/* Historial */}
      {history.length > 1 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold text-slate-500 mb-2">
            Gasto por mes
          </p>
          {/* Las barras NO se veían. Su altura iba en % contra un padre de
              altura automática —la columna del mes—, y un porcentaje contra
              `auto` no resuelve: quedaban en cero. Ahora el % se mide contra un
              contenedor de altura fija (`h-16`), que sí es una referencia real.

              Y va en `style` con transición CSS, no en un `initial` de framer:
              el dato correcto queda pintado desde el primer fotograma aunque la
              animación no llegue a correr. */}
          <div className="flex items-end gap-1.5">
            {history.map((h, i) => (
              <div key={h.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="flex h-16 w-full items-end">
                  <div
                    className={`w-full rounded-t-md transition-[height] duration-700 ease-out ${
                      i === history.length - 1 ? 'bg-linear-to-t from-sky-400 to-sky-300' : 'bg-sky-200'
                    }`}
                    style={{ height: `${Math.max(6, (h.total / maxMonth) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                  {fmtMoney(h.total)}
                </span>
                <span className="text-[11px] text-slate-400 truncate">{monthLabel(h.month)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorías.
          `unitemized` va en la MISMA lista y al final: es la parte del mes que
          ningún producto explica —tickets guardados solo con su total— y sin
          ella el desglose sumaba $23 de un mes de $104. Los tres tickets que el
          usuario acababa de escanear simplemente no estaban en ninguna fila. */}
      {(g.categories.length > 0 || g.unitemized !== null) && (
        <div className="mt-4">
          {/* El título dice de qué es el desglose y lo ata al número de arriba.
              «En qué se va este mes» no decía ni que era solo el super, ni que
              sumaba justo esos $82 — parecía una lista de gastos cualquiera. */}
          <p className="text-[11px] font-bold text-slate-500 mb-2">
            Tus {fmtMoneyFine(g.spentThisMonth)} de super, por categoría
          </p>
          <ul className="space-y-1">
            {[...g.categories.slice(0, 4), ...(g.unitemized ? [g.unitemized] : [])].map((c) => (
              <li key={c.category}>
                {/* Cada fila abre lo que hay dentro. El chevron es toda la
                    instrucción que necesita: se toca y se ve. */}
                <button
                  type="button"
                  onClick={() => { haptic(); setOpenCategory(c.category); }}
                  className="flex w-full items-center gap-2.5 rounded-xl -mx-1.5 px-1.5 py-1 text-left transition active:scale-[0.99] active:bg-white/70"
                >
                  <span className="text-base shrink-0" aria-hidden="true">
                    {c === g.unitemized ? '🧾' : categoryEmoji(c.category)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      {/* Las categorías ya vienen con su capitalización correcta
                          ("Condimentos y Salsas"): `capitalize` las estropearía. */}
                      <span className="text-xs font-bold text-slate-700 truncate">
                        {c.category}
                        {/* El resto necesita explicarse: si no, parece una
                            categoría más y el usuario se pregunta qué compró. */}
                        {c === g.unitemized && (
                          <span className="ml-1.5 font-normal text-slate-400">
                            tickets sin productos
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-black text-black tabular-nums shrink-0">
                        {fmtMoneyFine(c.currentMonth)}
                        {c.deltaPct !== null && Math.abs(c.deltaPct) >= 10 && (
                          <span className={`ml-1.5 font-bold ${c.deltaPct > 0 ? 'text-blue-700' : 'text-sky-700'}`}>
                            {c.deltaPct > 0 ? '+' : ''}{Math.round(c.deltaPct)}%
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="block h-1.5 rounded-full bg-white mt-1 overflow-hidden">
                      <motion.span
                        className={`block h-full rounded-full bg-linear-to-r ${
                          c === g.unitemized ? 'from-slate-200 to-slate-300' : 'from-sky-300 to-blue-300'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${c.share}%` }}
                        transition={{ duration: 0.7 }}
                      />
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-slate-300 text-sm">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openCategory !== null && (
        <CategoryDetailSheet
          category={openCategory}
          onClose={() => setOpenCategory(null)}
          onChanged={onChanged}
        />
      )}

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-sky-100">
        {/* La conexión con el plan, en una línea y al final: es la respuesta a
            "¿y esto qué tiene que ver con mis metas?", no la portada. */}
        <p className="text-[11px] text-slate-500 min-w-0">
          {g.baselineSource === 'limit'
            ? <>Sin compras aún: el plan usa tu límite de <span className="font-bold text-slate-700">{fmtMoneyFine(g.baseline)}</span>.</>
            : <>El plan resta <span className="font-bold text-slate-700">{fmtMoneyFine(g.baseline)}</span> al mes de super
                {g.baselineSource === 'average' ? ', tu promedio real.' : ', según tus tickets.'}</>}
        </p>
        <ScanTicketButton />
      </div>
    </section>
  );
}
