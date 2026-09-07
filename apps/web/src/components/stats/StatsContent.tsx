'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatsDetailSheet, { type ActiveDetail, type DetailType } from './StatsDetailSheet';
import SectionHeader from '@/components/layout/SectionHeader';
import GroceryCategoryBreakdown from '@/components/finance/GroceryCategoryBreakdown';
import type { GroceryInsight } from '@/lib/grocery-insights';
import { getStoreLogo } from '@/lib/store-logo';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TopProduct {
  name: string;
  purchases: number;
  totalQty: number;
}

export interface StatsContentProps {
  readonly stock: { full: number; half: number; empty: number };
  readonly topStores: { name: string; trips: number; totalSpent: number }[];
  readonly monthlySpending: { month: string; total: number; trips: number }[];
  readonly totalProducts: number;
  readonly topProducts: TopProduct[];
  readonly groceries: GroceryInsight;
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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Con centavos: el total del subtítulo tiene que cuadrar con la lista. */
function formatCurrencyFine(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' }).format(
    new Date(Number(y), Number(m) - 1),
  );
}

/** Card header: color-accented icon chip + title + optional subtitle. */
function CardHeader({
  emoji,
  chipClass,
  title,
  subtitle,
  trailing,
}: {
  readonly emoji: string;
  readonly chipClass: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 ${chipClass}`}
        aria-hidden="true"
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {trailing}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StatsContent({
  stock,
  topStores,
  monthlySpending,
  totalProducts,
  topProducts,
  groceries,
  totalThisMonth,
  insights,
  fullPct,
  halfPct,
  emptyPct,
  maxTrips,
  maxSpend,
}: StatsContentProps) {
  const router = useRouter();
  const [activeDetail, setActiveDetail] = useState<ActiveDetail | null>(null);

  const openDetail = useCallback((type: DetailType, value: string, label: string) => {
    setActiveDetail({ type, value, label });
  }, []);

  const closeDetail = useCallback(() => setActiveDetail(null), []);

  const knownStores = topStores.map((s) => s.name).filter((n) => n !== 'Sin tienda');
  const refreshData = useCallback(() => router.refresh(), [router]);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <>
      <div className="space-y-10">
        {/* ─── Zona: compras y gasto ─────────────────────────────────────────── */}
        <div className="space-y-5">
        <SectionHeader emoji="💰" title="Compras y gasto" />

        {/* ─── Insights ────────────────────────────────────────────────────── */}
        {insights.length > 0 && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader emoji="✨" chipClass="bg-sky-50 dark:bg-sky-950/40" title="Insights del mes" />
            <div className="space-y-2 card-stagger">
              {insights.map((insight) => (
                <div
                  key={insight}
                  className="flex items-start gap-2 bg-slate-50 dark:bg-white/10 rounded-xl px-4 py-3"
                >
                  <p className="text-slate-800 dark:text-white text-sm">{insight}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Monthly spending ─────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardHeader
            emoji="💵"
            chipClass="bg-sky-50 dark:bg-sky-950/40"
            title="Gasto mensual"
            trailing={
              totalThisMonth > 0 ? (
                <span className="text-slate-500 dark:text-slate-400 text-sm shrink-0">
                  {formatCurrency(totalThisMonth)} este mes
                </span>
              ) : undefined
            }
          />

          {monthlySpending.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">
              Sin datos de compras aún.
            </p>
          ) : (
            <div className="flex items-end gap-2 h-36">
              {monthlySpending.map((m, i) => {
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
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                      {formatCurrency(m.total)}
                    </span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className={`w-full rounded-t-lg grow-bar-y transition-colors duration-300 ${
                          isCurrent
                            ? 'bg-brand-400 group-hover:bg-brand-500'
                            : 'bg-slate-200 dark:bg-white/20 group-hover:bg-slate-300 dark:group-hover:bg-white/30'
                        }`}
                        style={{ height: `${heightPct}%`, animationDelay: `${i * 70}ms` }}
                        title={`${m.trips} compras`}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
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
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader
              emoji="🏆"
              chipClass="bg-sky-50 dark:bg-sky-950/40"
              title="Productos más comprados"
            />
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
                      <span className="text-slate-800 dark:text-slate-100 font-medium flex items-center gap-1.5 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition">
                        <span className="inline-block transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">{medals[i] ?? `${i + 1}.`}</span>
                        {p.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-xs">
                        {p.purchases} {p.purchases === 1 ? 'compra' : 'compras'}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 group-hover:bg-brand-500 rounded-full grow-bar transition-colors duration-300"
                        style={{ width: `${pct}%`, animationDelay: `${i * 80}ms` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── En qué se fue el super ──────────────────────────────────────
            Esta lista vivía en el Plan financiero, que no es su sitio: el plan
            responde «cuánto me queda para mis metas» y esto responde «en qué se
            me fue». Aquí había una versión propia, más pobre: sin la fila de
            «Sin detallar» enseñaba $49.90 de un mes de $176.94 y las cifras de
            las dos pantallas no cuadraban. */}
        {(groceries.categories.length > 0 || groceries.unitemized !== null) && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader
              emoji="📂"
              chipClass="bg-sky-50 dark:bg-sky-950/40"
              title="Gastos en comida por categoría"
              subtitle={`Tus ${formatCurrencyFine(groceries.spentThisMonth)} de super este mes · vs mes anterior`}
            />
            <GroceryCategoryBreakdown groceries={groceries} onChanged={refreshData} />
          </section>
        )}

        </div>

        {/* ─── Zona: despensa y supermercados ──────────────────────────────── */}
        <div className="space-y-5">
        <SectionHeader emoji="🏠" title="Despensa y supermercados" />

        {/* ─── Stock overview ──────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardHeader
            emoji="🥫"
            chipClass="bg-brand-50 dark:bg-brand-900/30"
            title="Estado de tu despensa"
            subtitle={`${totalProducts} productos · toca una barra para ver cuáles`}
          />
          <div className="space-y-3">
            {/* Lleno */}
            <button
              type="button"
              onClick={() => openDetail('stock', 'full', `✅ Lleno (${stock.full})`)}
              disabled={stock.full === 0}
              className="w-full text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex justify-between text-sm mb-1">
                <span className="text-sky-600 dark:text-sky-400 font-medium group-hover:text-sky-700 dark:group-hover:text-sky-300 transition">
                  ✅ Lleno
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {stock.full} · {fullPct}%
                </span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-400 group-hover:bg-sky-500 rounded-full grow-bar transition-colors duration-300"
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
                <span className="text-sky-500 dark:text-sky-400 font-medium group-hover:text-sky-600 transition">
                  ⚠️ Queda poco
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {stock.half} · {halfPct}%
                </span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-400 group-hover:bg-sky-500 rounded-full grow-bar transition-colors duration-300"
                  style={{ width: `${halfPct}%`, animationDelay: '120ms' }}
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
                <span className="text-blue-500 dark:text-blue-400 font-medium group-hover:text-blue-600 transition">
                  🚨 Se acabó
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {stock.empty} · {emptyPct}%
                </span>
              </div>
              <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 group-hover:bg-blue-600 rounded-full grow-bar transition-colors duration-300"
                  style={{ width: `${emptyPct}%`, animationDelay: '240ms' }}
                />
              </div>
            </button>
          </div>
        </section>

        {/* ─── Top supermarkets ────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
          <CardHeader
            emoji="🛒"
            chipClass="bg-sky-50 dark:bg-sky-950/40"
            title="Supermercados más usados"
            subtitle={topStores.length > 0 ? undefined : 'Basado en tus compras registradas'}
          />
          {topStores.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">
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
                      <span className="text-slate-800 dark:text-slate-100 font-medium flex items-center gap-1.5 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition">
                        {(() => {
                          const logo = getStoreLogo(store.name);
                          return logo ? (
                            <span className="w-5 h-5 rounded-sm overflow-hidden flex items-center justify-center bg-white border border-slate-100 shrink-0">
                              <Image src={logo} alt={store.name} width={20} height={20} className="object-contain w-full h-full" />
                            </span>
                          ) : (
                            <span className="inline-block transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">{medals[i] ?? `${i + 1}.`}</span>
                          );
                        })()}
                        {store.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 text-xs">
                        {store.trips} {store.trips === 1 ? 'compra' : 'compras'} ·{' '}
                        {formatCurrency(store.totalSpent)}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 group-hover:bg-brand-500 rounded-full grow-bar transition-colors duration-300"
                        style={{ width: `${pct}%`, animationDelay: `${i * 80}ms` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        </div>
      </div>

      <StatsDetailSheet
        open={activeDetail !== null}
        detail={activeDetail}
        onClose={closeDetail}
        knownStores={knownStores}
        onDataChanged={refreshData}
      />
    </>
  );
}
