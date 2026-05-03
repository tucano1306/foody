'use client';

import { useCallback, useState } from 'react';
import StatsDetailSheet, { type ActiveDetail, type DetailType } from './StatsDetailSheet';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TopProduct {
  name: string;
  purchases: number;
  totalQty: number;
}

export interface CategorySpend {
  category: string;
  currentMonth: number;
  prevMonth: number;
}

export interface StatsContentProps {
  readonly stock: { full: number; half: number; empty: number };
  readonly topStores: { name: string; trips: number; totalSpent: number }[];
  readonly monthlySpending: { month: string; total: number; trips: number }[];
  readonly totalProducts: number;
  readonly topProducts: TopProduct[];
  readonly categorySpend: CategorySpend[];
  readonly totalThisMonth: number;
  readonly insights: string[];
  readonly fullPct: number;
  readonly halfPct: number;
  readonly emptyPct: number;
  readonly maxTrips: number;
  readonly maxSpend: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' }).format(
    new Date(Number(y), Number(m) - 1),
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StatsContent({
  stock,
  topStores,
  monthlySpending,
  totalProducts,
  topProducts,
  categorySpend,
  totalThisMonth,
  insights,
  fullPct,
  halfPct,
  emptyPct,
  maxTrips,
  maxSpend,
}: StatsContentProps) {
  const [activeDetail, setActiveDetail] = useState<ActiveDetail | null>(null);

  const openDetail = useCallback((type: DetailType, value: string, label: string) => {
    setActiveDetail({ type, value, label });
  }, []);

  const closeDetail = useCallback(() => setActiveDetail(null), []);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <>
      <div className="space-y-6">
        {/* ─── Insights ────────────────────────────────────────────────────── */}
        {insights.length > 0 && (
          <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-3">✨ Insights del mes</h2>
            <div className="space-y-2">
              {insights.map((insight) => (
                <div
                  key={insight}
                  className="flex items-start gap-2 bg-stone-50 dark:bg-white/10 rounded-xl px-4 py-3"
                >
                  <p className="text-stone-800 dark:text-white text-sm">{insight}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Monthly spending ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-stone-800 dark:text-stone-100 font-bold">💰 Gasto mensual</h2>
            {totalThisMonth > 0 && (
              <span className="text-stone-500 dark:text-stone-400 text-sm">
                {formatCurrency(totalThisMonth)} este mes
              </span>
            )}
          </div>
          <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">
            Toca un mes para ver el detalle
          </p>

          {monthlySpending.length === 0 ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm text-center py-4">
              Sin datos de compras aún.
            </p>
          ) : (
            <div className="flex items-end gap-2 h-36">
              {monthlySpending.map((m) => {
                const isCurrent = m.month === thisMonthKey;
                const heightPct = Math.max(8, Math.round((m.total / maxSpend) * 100));
                return (
                  <button
                    key={m.month}
                    type="button"
                    onClick={() =>
                      openDetail(
                        'month',
                        m.month,
                        `Compras · ${formatMonth(m.month)}`,
                      )
                    }
                    className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
                  >
                    <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium group-hover:text-stone-700 dark:group-hover:text-stone-200 transition">
                      {formatCurrency(m.total)}
                    </span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className={`w-full rounded-t-lg transition-all duration-700 ${
                          isCurrent
                            ? 'bg-brand-400 group-hover:bg-brand-500'
                            : 'bg-stone-200 dark:bg-white/20 group-hover:bg-stone-300 dark:group-hover:bg-white/30'
                        }`}
                        style={{ height: `${heightPct}%` }}
                        title={`${m.trips} compras`}
                      />
                    </div>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500">
                      {formatMonth(m.month)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Top products ─────────────────────────────────────────────────── */}
        {topProducts.length > 0 && (
          <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">
              🏆 Productos más comprados
            </h2>
            <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">
              Toca un producto para ver su historial
            </p>
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const maxPurchases = topProducts[0].purchases;
                const pct = Math.round((p.purchases / maxPurchases) * 100);
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() =>
                      openDetail('product', p.name, `Historial · ${p.name}`)
                    }
                    className="w-full text-left group"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-stone-800 dark:text-stone-100 font-medium flex items-center gap-1.5 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition">
                        <span>{medals[i] ?? `${i + 1}.`}</span>
                        {p.name}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400 text-xs">
                        {p.purchases} {p.purchases === 1 ? 'compra' : 'compras'}
                      </span>
                    </div>
                    <div className="h-2 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 group-hover:bg-brand-500 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Category spend comparison ────────────────────────────────────── */}
        {categorySpend.length > 0 && (
          <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
            <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">
              📂 Gasto por categoría
            </h2>
            <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">
              Este mes vs mes anterior
            </p>
            <div className="space-y-3">
              {categorySpend.map((cat) => {
                const diff =
                  cat.prevMonth > 0
                    ? Math.round(((cat.currentMonth - cat.prevMonth) / cat.prevMonth) * 100)
                    : null;
                return (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-stone-800 dark:text-stone-100 text-sm font-medium truncate flex-1">
                      {cat.category}
                    </span>
                    <span className="text-stone-500 dark:text-stone-400 text-xs shrink-0">
                      {formatCurrency(cat.currentMonth)}
                    </span>
                    {diff !== null &&
                      (() => {
                        let cls =
                          'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400';
                        if (diff < 0) cls = 'bg-emerald-500/20 text-emerald-300';
                        else if (diff > 0) cls = 'bg-red-500/20 text-red-300';
                        return (
                          <span
                            className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-full ${cls}`}
                          >
                            {diff > 0 ? '+' : ''}
                            {diff}%
                          </span>
                        );
                      })()}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Stock overview ──────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">
            🏠 Estado de tu despensa
          </h2>
          <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">
            {totalProducts} productos · toca una barra para ver cuáles
          </p>
          <div className="space-y-3">
            {/* Lleno */}
            <button
              type="button"
              onClick={() => openDetail('stock', 'full', `✅ Lleno (${stock.full})`)}
              disabled={stock.full === 0}
              className="w-full text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex justify-between text-sm mb-1">
                <span className="text-emerald-400 font-medium group-hover:text-emerald-500 transition">
                  ✅ Lleno
                </span>
                <span className="text-stone-500 dark:text-stone-400">
                  {stock.full} · {fullPct}%
                </span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 group-hover:bg-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${fullPct}%` }}
                />
              </div>
            </button>

            {/* Queda poco */}
            <button
              type="button"
              onClick={() => openDetail('stock', 'half', `⚠️ Queda poco (${stock.half})`)}
              disabled={stock.half === 0}
              className="w-full text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex justify-between text-sm mb-1">
                <span className="text-amber-500 dark:text-amber-400 font-medium group-hover:text-amber-600 transition">
                  ⚠️ Queda poco
                </span>
                <span className="text-stone-500 dark:text-stone-400">
                  {stock.half} · {halfPct}%
                </span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 group-hover:bg-amber-500 rounded-full transition-all duration-700"
                  style={{ width: `${halfPct}%` }}
                />
              </div>
            </button>

            {/* Se acabó */}
            <button
              type="button"
              onClick={() => openDetail('stock', 'empty', `🚨 Se acabó (${stock.empty})`)}
              disabled={stock.empty === 0}
              className="w-full text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex justify-between text-sm mb-1">
                <span className="text-rose-500 dark:text-rose-400 font-medium group-hover:text-rose-600 transition">
                  🚨 Se acabó
                </span>
                <span className="text-stone-500 dark:text-stone-400">
                  {stock.empty} · {emptyPct}%
                </span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 group-hover:bg-rose-600 rounded-full transition-all duration-700"
                  style={{ width: `${emptyPct}%` }}
                />
              </div>
            </button>
          </div>
        </section>

        {/* ─── Top supermarkets ────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">
            🛒 Supermercados más usados
          </h2>
          <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">
            {topStores.length > 0 ? 'Toca una tienda para ver las compras' : 'Basado en tus compras registradas'}
          </p>
          {topStores.length === 0 ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm text-center py-4">
              Aún no tienes compras registradas.
            </p>
          ) : (
            <div className="space-y-3">
              {topStores.map((store, i) => {
                const pct = Math.round((store.trips / maxTrips) * 100);
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <button
                    key={store.name}
                    type="button"
                    onClick={() =>
                      openDetail('store', store.name, `🛒 ${store.name}`)
                    }
                    className="w-full text-left group"
                  >
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-stone-800 dark:text-stone-100 font-medium flex items-center gap-1.5 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition">
                        <span>{medals[i] ?? `${i + 1}.`}</span>
                        {store.name}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400 text-xs">
                        {store.trips} {store.trips === 1 ? 'visita' : 'visitas'} ·{' '}
                        {formatCurrency(store.totalSpent)}
                      </span>
                    </div>
                    <div className="h-2.5 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 group-hover:bg-brand-500 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <StatsDetailSheet open={activeDetail !== null} detail={activeDetail} onClose={closeDetail} />
    </>
  );
}
