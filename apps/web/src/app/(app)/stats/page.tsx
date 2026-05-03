import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Estadísticas — Foody' };

interface TopProduct { name: string; purchases: number; totalQty: number; }
interface CategorySpend { category: string; currentMonth: number; prevMonth: number; }

interface StatsData {
  stock: { full: number; half: number; empty: number };
  topStores: { name: string; trips: number; totalSpent: number }[];
  monthlySpending: { month: string; total: number; trips: number }[];
  totalProducts: number;
  topProducts: TopProduct[];
  categorySpend: CategorySpend[];
  totalThisMonth: number;
  totalLastMonth: number;
}

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

async function getStats(userId: string, householdId: string | null): Promise<StatsData> {
  const productScope = householdId
    ? sql`household_id = ${householdId}`
    : sql`user_id = ${userId} AND household_id IS NULL`;

  const tripScope = householdId
    ? sql`household_id = ${householdId}`
    : sql`user_id = ${userId} AND household_id IS NULL`;

  const ppScope = householdId
    ? sql`pp.household_id = ${householdId}`
    : sql`pp.user_id = ${userId} AND pp.household_id IS NULL`;

  const [stockRows, storeRows, monthRows, totalRows, topProductRows, categoryRows] = await Promise.all([
    sql`SELECT stock_level, COUNT(*) AS count FROM products WHERE ${productScope} GROUP BY stock_level`,
    sql`
      SELECT COALESCE(store_name, 'Sin nombre') AS name, COUNT(*) AS trips, SUM(total_amount) AS total_spent
      FROM shopping_trips WHERE ${tripScope}
      GROUP BY COALESCE(store_name, 'Sin nombre') ORDER BY trips DESC LIMIT 5
    `,
    sql`
      SELECT TO_CHAR(purchased_at, 'YYYY-MM') AS month, SUM(total_amount) AS total, COUNT(*) AS trips
      FROM shopping_trips WHERE ${tripScope} AND purchased_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(purchased_at, 'YYYY-MM') ORDER BY month ASC
    `,
    sql`SELECT COUNT(*) AS count FROM products WHERE ${productScope}`,
    sql`
      SELECT p.name, COUNT(pp.id) AS purchases, SUM(pp.quantity) AS total_qty
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      WHERE ${ppScope}
      GROUP BY p.name
      ORDER BY purchases DESC
      LIMIT 8
    `,
    sql`
      SELECT
        COALESCE(p.category, 'Sin categoría') AS category,
        SUM(CASE WHEN DATE_TRUNC('month', pp.purchased_at) = DATE_TRUNC('month', NOW()) THEN pp.total_price ELSE 0 END) AS current_month,
        SUM(CASE WHEN DATE_TRUNC('month', pp.purchased_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month') THEN pp.total_price ELSE 0 END) AS prev_month
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      WHERE ${ppScope}
        AND pp.purchased_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      GROUP BY COALESCE(p.category, 'Sin categoría')
      ORDER BY current_month DESC
    `,
  ]);

  const stock = { full: 0, half: 0, empty: 0 };
  for (const row of stockRows as { stock_level: string; count: string }[]) {
    const lvl = row.stock_level as keyof typeof stock;
    if (lvl in stock) stock[lvl] = Number.parseInt(row.count, 10);
  }

  const monthlySpending = (monthRows as { month: string; total: string; trips: string }[]).map((r) => ({
    month: r.month,
    total: Number.parseFloat(r.total ?? '0'),
    trips: Number.parseInt(r.trips, 10),
  }));

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const totalThisMonth = monthlySpending.find((m) => m.month === thisMonthKey)?.total ?? 0;
  const totalLastMonth = monthlySpending.find((m) => m.month === prevMonthKey)?.total ?? 0;

  return {
    stock,
    topStores: (storeRows as { name: string; trips: string; total_spent: string }[]).map((r) => ({
      name: r.name,
      trips: Number.parseInt(r.trips, 10),
      totalSpent: Number.parseFloat(r.total_spent ?? '0'),
    })),
    monthlySpending,
    totalProducts: Number.parseInt((totalRows[0] as { count: string }).count, 10),
    topProducts: (topProductRows as { name: string; purchases: string; total_qty: string }[]).map((r) => ({
      name: r.name,
      purchases: Number.parseInt(r.purchases, 10),
      totalQty: Number.parseFloat(r.total_qty ?? '0'),
    })),
    categorySpend: (categoryRows as { category: string; current_month: string; prev_month: string }[]).map((r) => ({
      category: r.category,
      currentMonth: Number.parseFloat(r.current_month ?? '0'),
      prevMonth: Number.parseFloat(r.prev_month ?? '0'),
    })),
    totalThisMonth,
    totalLastMonth,
  };
}

function buildInsights(categorySpend: CategorySpend[], totalThisMonth: number, totalLastMonth: number): string[] {
  const insights: string[] = [];

  if (totalLastMonth > 0 && totalThisMonth > 0) {
    const pct = Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100);
    if (pct < -5) insights.push(`💚 Gastaste ${Math.abs(pct)}% menos en total este mes`);
    else if (pct > 5) insights.push(`🔴 Gastaste ${pct}% más en total este mes`);
  }

  for (const cat of categorySpend) {
    if (cat.prevMonth <= 0 || cat.currentMonth <= 0) continue;
    const pct = Math.round(((cat.currentMonth - cat.prevMonth) / cat.prevMonth) * 100);
    if (pct <= -15) insights.push(`💚 Gastaste ${Math.abs(pct)}% menos en ${cat.category} este mes`);
    else if (pct >= 20) insights.push(`🔴 Gastaste ${pct}% más en ${cat.category} vs el mes pasado`);
  }

  return insights.slice(0, 4);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' }).format(new Date(Number(y), Number(m) - 1));
}

export default async function StatsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  let data: StatsData;
  try {
    const householdId = await getUserHousehold(session.userId);
    data = await getStats(session.userId, householdId);
  } catch {
    data = {
      stock: { full: 0, half: 0, empty: 0 },
      topStores: [], monthlySpending: [], totalProducts: 0,
      topProducts: [], categorySpend: [], totalThisMonth: 0, totalLastMonth: 0,
    };
  }

  const { stock, topStores, monthlySpending, totalProducts, topProducts, categorySpend, totalThisMonth, totalLastMonth } = data;
  const totalStockCount = stock.full + stock.half + stock.empty || 1;
  const fullPct = Math.round((stock.full / totalStockCount) * 100);
  const halfPct = Math.round((stock.half / totalStockCount) * 100);
  const emptyPct = Math.round((stock.empty / totalStockCount) * 100);
  const maxTrips = topStores.length > 0 ? topStores[0].trips : 1;
  const maxSpend = monthlySpending.length > 0 ? Math.max(...monthlySpending.map((m) => m.total)) || 1 : 1;
  const insights = buildInsights(categorySpend, totalThisMonth, totalLastMonth);

  return (
    <div className="space-y-6">
      <ModernTitle
        title="📊 Estadísticas"
        subtitle="Un vistazo a tus hábitos de compra y despensa."
      />

      {/* ─── Insights ────────────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-3">✨ Insights del mes</h2>
          <div className="space-y-2">
            {insights.map((insight) => (
              <div key={insight} className="flex items-start gap-2 bg-stone-50 dark:bg-white/10 rounded-xl px-4 py-3">
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
            <span className="text-stone-500 dark:text-stone-400 text-sm">{formatCurrency(totalThisMonth)} este mes</span>
          )}
        </div>
        <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">Últimos 6 meses</p>

        {monthlySpending.length === 0 ? (
          <p className="text-stone-500 dark:text-stone-400 text-sm text-center py-4">Sin datos de compras aún.</p>
        ) : (
          <div className="flex items-end gap-2 h-36">
            {(() => {
              const now = new Date();
              const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              return monthlySpending.map((m) => {
                const isCurrent = m.month === thisKey;
                const heightPct = Math.max(8, Math.round((m.total / maxSpend) * 100));
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-stone-500 dark:text-stone-400 font-medium">{formatCurrency(m.total)}</span>
                    <div className="w-full flex items-end" style={{ height: '80px' }}>
                      <div
                        className={`w-full rounded-t-lg transition-all duration-700 ${isCurrent ? 'bg-brand-400' : 'bg-stone-200 dark:bg-white/20'}`}
                        style={{ height: `${heightPct}%` }}
                        title={`${m.trips} compras`}
                      />
                    </div>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500">{formatMonth(m.month)}</span>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </section>

      {/* ─── Top products ─────────────────────────────────────────────────── */}
      {topProducts.length > 0 && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">🏆 Productos más comprados</h2>
          <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">Basado en tu historial de compras</p>
          <div className="space-y-3">
            {topProducts.map((p, i) => {
              const maxPurchases = topProducts[0].purchases;
              const pct = Math.round((p.purchases / maxPurchases) * 100);
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <div key={p.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-stone-800 dark:text-stone-100 font-medium flex items-center gap-1.5">
                      <span>{medals[i] ?? `${i + 1}.`}</span>
                      {p.name}
                    </span>
                    <span className="text-stone-500 dark:text-stone-400 text-xs">{p.purchases} {p.purchases === 1 ? 'compra' : 'compras'}</span>
                  </div>
                  <div className="h-2 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── Category spend comparison ────────────────────────────────────── */}
      {categorySpend.length > 0 && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">📂 Gasto por categoría</h2>
          <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">Este mes vs mes anterior</p>
          <div className="space-y-3">
            {categorySpend.map((cat) => {
              const diff = cat.prevMonth > 0
                ? Math.round(((cat.currentMonth - cat.prevMonth) / cat.prevMonth) * 100)
                : null;
              return (
                <div key={cat.category} className="flex items-center justify-between gap-3">
                  <span className="text-stone-800 dark:text-stone-100 text-sm font-medium truncate flex-1">{cat.category}</span>
                  <span className="text-stone-500 dark:text-stone-400 text-xs shrink-0">{formatCurrency(cat.currentMonth)}</span>
                  {diff !== null && (() => {
                    let cls = 'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400';
                    if (diff < 0) cls = 'bg-emerald-500/20 text-emerald-300';
                    else if (diff > 0) cls = 'bg-red-500/20 text-red-300';
                    return (
                      <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-full ${cls}`}>
                        {diff > 0 ? '+' : ''}{diff}%
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
        <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">🏠 Estado de tu despensa</h2>
        <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">{totalProducts} productos en total</p>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-emerald-400 font-medium">✅ Lleno</span>
              <span className="text-stone-500 dark:text-stone-400">{stock.full} · {fullPct}%</span>
            </div>
            <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${fullPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-amber-500 dark:text-amber-400 font-medium">⚠️ Queda poco</span>
              <span className="text-stone-500 dark:text-stone-400">{stock.half} · {halfPct}%</span>
            </div>
            <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${halfPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-rose-500 dark:text-rose-400 font-medium">🚨 Se acabó</span>
              <span className="text-stone-500 dark:text-stone-400">{stock.empty} · {emptyPct}%</span>
            </div>
            <div className="h-3 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full transition-all duration-700" style={{ width: `${emptyPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Top supermarkets ────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
        <h2 className="text-stone-800 dark:text-stone-100 font-bold mb-1">🛒 Supermercados más usados</h2>
        <p className="text-stone-500 dark:text-stone-400 text-xs mb-4">Basado en tus compras registradas</p>
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
                <div key={store.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-stone-800 dark:text-stone-100 font-medium flex items-center gap-1.5">
                      <span>{medals[i] ?? `${i + 1}.`}</span>
                      {store.name}
                    </span>
                    <span className="text-stone-500 dark:text-stone-400 text-xs">
                      {store.trips} {store.trips === 1 ? 'visita' : 'visitas'} · {formatCurrency(store.totalSpent)}
                    </span>
                  </div>
                  <div className="h-2.5 bg-stone-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-400 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
