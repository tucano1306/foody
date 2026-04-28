import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import ModernTitle from '@/components/layout/ModernTitle';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Estadísticas — Foody' };

interface StockData {
  stock: { full: number; half: number; empty: number };
  topStores: { name: string; trips: number; totalSpent: number }[];
  monthlySpending: { month: string; total: number; trips: number }[];
  totalProducts: number;
}

async function getStats(userId: string): Promise<StockData> {
  const [stockRows, storeRows, monthRows, totalRows] = await Promise.all([
    sql`SELECT stock_level, COUNT(*) AS count FROM products WHERE user_id = ${userId} GROUP BY stock_level`,
    sql`
      SELECT COALESCE(store_name, 'Sin nombre') AS name, COUNT(*) AS trips, SUM(total_spent) AS total_spent
      FROM shopping_trips WHERE user_id = ${userId}
      GROUP BY COALESCE(store_name, 'Sin nombre') ORDER BY trips DESC LIMIT 5
    `,
    sql`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month, SUM(total_spent) AS total, COUNT(*) AS trips
      FROM shopping_trips WHERE user_id = ${userId} AND date >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(date, 'YYYY-MM') ORDER BY month ASC
    `,
    sql`SELECT COUNT(*) AS count FROM products WHERE user_id = ${userId}`,
  ]);

  const stock = { full: 0, half: 0, empty: 0 };
  for (const row of stockRows as { stock_level: string; count: string }[]) {
    const lvl = row.stock_level as keyof typeof stock;
    if (lvl in stock) stock[lvl] = Number.parseInt(row.count, 10);
  }

  return {
    stock,
    topStores: (storeRows as { name: string; trips: string; total_spent: string }[]).map((r) => ({
      name: r.name,
      trips: Number.parseInt(r.trips, 10),
      totalSpent: Number.parseFloat(r.total_spent ?? '0'),
    })),
    monthlySpending: (monthRows as { month: string; total: string; trips: string }[]).map((r) => ({
      month: r.month,
      total: Number.parseFloat(r.total ?? '0'),
      trips: Number.parseInt(r.trips, 10),
    })),
    totalProducts: Number.parseInt((totalRows[0] as { count: string }).count, 10),
  };
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

  let data: StockData;
  try {
    data = await getStats(session.userId);
  } catch {
    data = { stock: { full: 0, half: 0, empty: 0 }, topStores: [], monthlySpending: [], totalProducts: 0 };
  }

  const { stock, topStores, monthlySpending, totalProducts } = data;
  const totalStockCount = stock.full + stock.half + stock.empty || 1;
  const fullPct = Math.round((stock.full / totalStockCount) * 100);
  const halfPct = Math.round((stock.half / totalStockCount) * 100);
  const emptyPct = Math.round((stock.empty / totalStockCount) * 100);

  const maxTrips = topStores.length > 0 ? topStores[0].trips : 1;
  const maxSpend = monthlySpending.length > 0 ? Math.max(...monthlySpending.map((m) => m.total)) || 1 : 1;

  return (
    <div className="space-y-6">
      <ModernTitle
        title="📊 Estadísticas"
        subtitle="Un vistazo a tus hábitos de compra y despensa."
      />

      {/* ─── Stock overview ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
        <h2 className="font-bold text-stone-800 mb-1">Estado de tu despensa</h2>
        <p className="text-xs text-stone-400 mb-4">{totalProducts} productos en total</p>

        <div className="space-y-3">
          {/* Full */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-emerald-700 font-medium">✅ Lleno</span>
              <span className="text-stone-500">{stock.full} · {fullPct}%</span>
            </div>
            <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: `${fullPct}%` }} />
            </div>
          </div>
          {/* Half */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-amber-700 font-medium">⚠️ Queda poco</span>
              <span className="text-stone-500">{stock.half} · {halfPct}%</span>
            </div>
            <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${halfPct}%` }} />
            </div>
          </div>
          {/* Empty */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-rose-700 font-medium">🚨 Se acabó</span>
              <span className="text-stone-500">{stock.empty} · {emptyPct}%</span>
            </div>
            <div className="h-3 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full transition-all duration-700" style={{ width: `${emptyPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Top supermarkets ────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
        <h2 className="font-bold text-stone-800 mb-1">🛒 Supermercados más usados</h2>
        <p className="text-xs text-stone-400 mb-4">Basado en tus compras registradas</p>

        {topStores.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-4">
            Aún no tienes compras registradas. ¡Registra tu primera compra en la sección Compras!
          </p>
        ) : (
          <div className="space-y-3">
            {topStores.map((store, i) => {
              const pct = Math.round((store.trips / maxTrips) * 100);
              return (
                <div key={store.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-stone-700 flex items-center gap-1.5">
                      {i === 0 && <span className="text-base">🥇</span>}
                      {i === 1 && <span className="text-base">🥈</span>}
                      {i === 2 && <span className="text-base">🥉</span>}
                      {i > 2 && <span className="w-5 text-center text-xs text-stone-400">{i + 1}</span>}
                      {store.name}
                    </span>
                    <span className="text-stone-400 text-xs">
                      {store.trips} {store.trips === 1 ? 'visita' : 'visitas'} · {formatCurrency(store.totalSpent)}
                    </span>
                  </div>
                  <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-400 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Monthly spending ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-5 border border-stone-100 shadow-sm">
        <h2 className="font-bold text-stone-800 mb-1">💰 Gasto mensual</h2>
        <p className="text-xs text-stone-400 mb-4">Últimos 6 meses</p>

        {monthlySpending.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-4">
            Sin datos de compras aún.
          </p>
        ) : (
          <div className="flex items-end gap-2 h-36">
            {monthlySpending.map((m) => {
              const heightPct = Math.max(8, Math.round((m.total / maxSpend) * 100));
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-stone-500 font-medium">{formatCurrency(m.total)}</span>
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className="w-full bg-brand-500 hover:bg-brand-600 rounded-t-lg transition-all duration-700"
                      style={{ height: `${heightPct}%` }}
                      title={`${m.trips} compras`}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400">{formatMonth(m.month)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
