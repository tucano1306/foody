'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatsDetailSheet, { type ActiveDetail, type DetailType } from './StatsDetailSheet';
import SectionHeader from '@/components/layout/SectionHeader';
import { getStoreLogo } from '@/lib/store-logo';

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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
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
        <h3 className="text-base sm:text-lg font-bold text-stone-800 dark:text-stone-100">{title}</h3>
        {subtitle && <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{subtitle}</p>}
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
  categorySpend,
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
          <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
            <CardHeader emoji="✨" chipClass="bg-amber-50 dark:bg-amber-950/40" title="Insights del mes" />
            <div className="space-y-2 card-stagger">
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
          <CardHeader
            emoji="💵"
            chipClass="bg-emerald-50 dark:bg-emerald-950/40"
            title="Gasto mensual"
            subtitle={monthlySpending.length > 0 ? 'Toca un mes para ver el detalle' : undefined}
            trailing={
              totalThisMonth > 0 ? (
                <span className="text-stone-500 dark:text-stone-400 text-sm shrink-0">
                  {formatCurrency(totalThisMonth)} este mes
                </span>
              ) : undefined
            }
          />

          {monthlySpending.length === 0 ? (
            <p className="text-stone-500 dark:text-stone-400 text-sm text-center py-4">
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
                    <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium group-hover:text-stone-700 dark:group-hover:text-stone-200 transition">
                      {formatCurrency(m.total)}
                    </span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className={`w-full rounded-t-lg grow-bar-y transition-colors duration-300 ${
                          isCurrent
                            ? 'bg-brand-400 group-hover:bg-brand-500'
                            : 'bg-stone-200 dark:bg-white/20 group-hover:bg-stone-300 dark:group-hover:bg-white/30'
                        }`}
                        style={{ height: `${heightPct}%`, animationDelay: `${i * 70}ms` }}
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
            <CardHeader
              emoji="🏆"
              chipClass="bg-sky-50 dark:bg-sky-950/40"
              title="Productos más comprados"
              subtitle="Toca un producto para ver su historial"
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
                      <span className="text-stone-800 dark:text-stone-100 font-medium flex items-center gap-1.5 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition">
                        <span className="inline-block transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">{medals[i] ?? `${i + 1}.`}</span>
                        {p.name}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400 text-xs">
                        {p.purchases} {p.purchases === 1 ? 'compra' : 'compras'}
                      </span>
                    </div>
                    <div className="h-2 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
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

        {/* ─── Category spend comparison ────────────────────────────────────── */}
        {categorySpend.length > 0 && (
          <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
            <CardHeader
              emoji="📂"
              chipClass="bg-violet-50 dark:bg-violet-950/40"
              title="Gasto por categoría"
              subtitle="Este mes vs mes anterior"
            />
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
                        if (diff < 0) cls = 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
                        else if (diff > 0) cls = 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300';
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

        </div>

        {/* ─── Zona: despensa y supermercados ──────────────────────────────── */}
        <div className="space-y-5">
        <SectionHeader emoji="🏠" title="Despensa y supermercados" />

        {/* ─── Stock overview ──────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
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
                <span className="text-emerald-600 dark:text-emerald-400 font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition">
                  ✅ Lleno
                </span>
                <span className="text-stone-500 dark:text-stone-400">
                  {stock.full} · {fullPct}%
                </span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 group-hover:bg-emerald-500 rounded-full grow-bar transition-colors duration-300"
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
                  className="h-full bg-amber-400 group-hover:bg-amber-500 rounded-full grow-bar transition-colors duration-300"
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
                <span className="text-rose-500 dark:text-rose-400 font-medium group-hover:text-rose-600 transition">
                  🚨 Se acabó
                </span>
                <span className="text-stone-500 dark:text-stone-400">
                  {stock.empty} · {emptyPct}%
                </span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 group-hover:bg-rose-600 rounded-full grow-bar transition-colors duration-300"
                  style={{ width: `${emptyPct}%`, animationDelay: '240ms' }}
                />
              </div>
            </button>
          </div>
        </section>

        {/* ─── Top supermarkets ────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <CardHeader
            emoji="🛒"
            chipClass="bg-indigo-50 dark:bg-indigo-950/40"
            title="Supermercados más usados"
            subtitle={topStores.length > 0 ? 'Toca una tienda para ver las compras' : 'Basado en tus compras registradas'}
          />
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
                        {(() => {
                          const logo = getStoreLogo(store.name);
                          return logo ? (
                            <span className="w-5 h-5 rounded-sm overflow-hidden flex items-center justify-center bg-white border border-stone-100 shrink-0">
                              <Image src={logo} alt={store.name} width={20} height={20} className="object-contain w-full h-full" />
                            </span>
                          ) : (
                            <span className="inline-block transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-12">{medals[i] ?? `${i + 1}.`}</span>
                          );
                        })()}
                        {store.name}
                      </span>
                      <span className="text-stone-500 dark:text-stone-400 text-xs">
                        {store.trips} {store.trips === 1 ? 'compra' : 'compras'} ·{' '}
                        {formatCurrency(store.totalSpent)}
                      </span>
                    </div>
                    <div className="h-2.5 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
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
