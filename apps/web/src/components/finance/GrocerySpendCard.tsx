'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CameraIcon } from '@heroicons/react/24/solid';
import { CATEGORY_EMOJI } from '@/lib/categories';
import type { GroceryInsight, MonthTotal } from '@/lib/grocery-insights';
import { fmtMoney } from './finance-ui';

interface Props {
  readonly groceries: GroceryInsight;
  readonly history: readonly MonthTotal[];
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
export default function GrocerySpendCard({ groceries: g, history }: Props) {
  if (g.baselineSource === 'none') return null;

  const overLimit = g.limit > 0 && g.overLimit > 0;
  const paceWidth = g.limit > 0 ? Math.min(100, (g.projectedMonthEnd / g.limit) * 100) : 100;
  const spentWidth = g.limit > 0 ? Math.min(100, (g.spentThisMonth / g.limit) * 100) : 0;
  const maxMonth = Math.max(...history.map((h) => h.total), g.projectedMonthEnd, 1);

  return (
    <section className="rounded-3xl border border-sky-100 bg-sky-50/70 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black text-black uppercase tracking-wide">
            🛒 Tus compras en el plan
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {g.baselineSource === 'pace'
              ? `El plan resta ${fmtMoney(g.baseline)} de super — calculado con tus tickets, no con el límite.`
              : g.baselineSource === 'average'
                ? `El plan resta ${fmtMoney(g.baseline)}: tu promedio real de los últimos meses.`
                : `Aún sin compras registradas: el plan usa tu límite de ${fmtMoney(g.baseline)}.`}
          </p>
        </div>
        {/* Mismo criterio que el consejero: con un solo mes cerrado —o con el
            mes recién empezado— el porcentaje compara contra ruido. */}
        {g.paceIsMeaningful && g.trendPct !== null && g.monthsWithData >= 2 && Math.abs(g.trendPct) >= 5 && (
          <span
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-black ${
              g.trendPct > 0
                ? 'bg-blue-100 text-blue-700'
                : 'bg-sky-100 text-sky-700'
            }`}
          >
            {g.trendPct > 0 ? '↑' : '↓'} {Math.abs(Math.round(g.trendPct))}%
          </span>
        )}
      </div>

      {/* Ritmo del mes — solo cuando ya significa algo. Al arrancar el mes, sin
          compras todavía, mostraba "cerrarás en $0" y "vas $500 por debajo del
          límite", que es ruido disfrazado de dato. */}
      {!g.paceIsMeaningful ? (
        <div className="rounded-2xl bg-white/70 p-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">🧾</span>
          <p className="text-sm text-slate-600">
            {g.spentThisMonth > 0
              ? `Llevas ${fmtMoney(g.spentThisMonth)} este mes.`
              : 'Aún no hay compras este mes.'}
          </p>
        </div>
      ) : (
      <div className="rounded-2xl bg-white/70 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Ritmo del mes · día {g.daysElapsed} de {g.daysInMonth}
          </span>
          <span className="text-xs font-bold tabular-nums text-black">
            {fmtMoney(g.dailyPace)}/día
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
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Llevas</p>
            <p className="text-sm font-black text-black tabular-nums">{fmtMoney(g.spentThisMonth)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Cerrarás en</p>
            <p className="text-sm font-black tabular-nums text-black">
              {fmtMoney(g.projectedMonthEnd)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">
              {g.limit > 0 ? 'Tu límite' : 'Tu promedio'}
            </p>
            <p className="text-sm font-black text-black tabular-nums">
              {fmtMoney(g.limit > 0 ? g.limit : g.avgMonthly)}
            </p>
          </div>
        </div>

        {g.limit > 0 && (
          <p className="text-xs mt-2.5 text-slate-700">
            {overLimit
              ? `⚠️ A este ritmo te pasas ${fmtMoney(g.overLimit)} — ese dinero deja de ir a tus metas.`
              : `✅ Vas ${fmtMoney(Math.abs(g.overLimit))} por debajo del límite: es dinero libre para tus metas.`}
          </p>
        )}
      </div>
      )}

      {/* Historial */}
      {history.length > 1 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
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
                <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                  {fmtMoney(h.total)}
                </span>
                <span className="text-[9px] text-slate-400 truncate">{monthLabel(h.month)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorías */}
      {g.categories.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            En qué se va este mes
          </p>
          <ul className="space-y-2">
            {g.categories.slice(0, 4).map((c) => (
              <li key={c.category} className="flex items-center gap-2.5">
                <span className="text-base shrink-0" aria-hidden="true">{categoryEmoji(c.category)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    {/* Las categorías ya vienen con su capitalización correcta
                        ("Condimentos y Salsas"): `capitalize` las estropearía. */}
                    <span className="text-xs font-bold text-slate-700 truncate">
                      {c.category}
                    </span>
                    <span className="text-xs font-black text-black tabular-nums shrink-0">
                      {fmtMoney(c.currentMonth)}
                      {c.deltaPct !== null && Math.abs(c.deltaPct) >= 10 && (
                        <span className={`ml-1.5 font-bold ${c.deltaPct > 0 ? 'text-blue-700' : 'text-sky-700'}`}>
                          {c.deltaPct > 0 ? '+' : ''}{Math.round(c.deltaPct)}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white mt-1 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-linear-to-r from-sky-300 to-blue-300"
                      initial={{ width: 0 }}
                      animate={{ width: `${c.share}%` }}
                      transition={{ duration: 0.7 }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-sky-100">
        <p className="text-[11px] text-slate-400">
          {g.tripsThisMonth > 0
            ? `${g.tripsThisMonth} ${g.tripsThisMonth === 1 ? 'visita' : 'visitas'} al super este mes`
            : 'Sin visitas registradas este mes'}
        </p>
        {/* Atajo directo al escáner: es la vía por la que entran los datos que
            alimentan todo el plan, y antes no había forma de llegar desde aquí. */}
        <Link
          href="/shopping-trips/new"
          className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-2xl bg-sky-500 active:bg-sky-600 active:scale-95 text-white text-sm font-bold shadow-sm transition"
        >
          <CameraIcon className="w-5 h-5" />
          Escanear factura
        </Link>
      </div>
    </section>
  );
}
