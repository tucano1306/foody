import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import ModernTitle from '@/components/layout/ModernTitle';
import StatsContent from '@/components/stats/StatsContent';
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
  // Inclusive scope: include personal data + household-scoped data so that
  // items created before joining a household are still visible.
  const productScope = householdId
    ? sql`(household_id = ${householdId} OR (user_id = ${userId} AND household_id IS NULL))`
    : sql`user_id = ${userId} AND household_id IS NULL`;

  const ppScope = householdId
    ? sql`(pp.household_id = ${householdId} OR (pp.user_id = ${userId} AND pp.household_id IS NULL))`
    : sql`pp.user_id = ${userId} AND pp.household_id IS NULL`;

  const [stockRows, storeRows, monthRows, totalRows, topProductRows, categoryRows] = await Promise.all([
    sql`SELECT stock_level, COUNT(*) AS count FROM products WHERE ${productScope} GROUP BY stock_level`,
    sql`
      SELECT COALESCE(pp.store_name, 'Sin tienda') AS name,
        COUNT(*) AS trips,
        SUM(COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0)) AS total_spent
      FROM product_purchases pp
      WHERE ${ppScope}
      GROUP BY COALESCE(pp.store_name, 'Sin tienda') ORDER BY trips DESC LIMIT 5
    `,
    sql`
      SELECT TO_CHAR(pp.purchased_at, 'YYYY-MM') AS month,
        SUM(COALESCE(pp.total_price, pp.unit_price * pp.quantity, 0)) AS total,
        COUNT(*) AS trips
      FROM product_purchases pp
      WHERE ${ppScope} AND pp.purchased_at >= NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(pp.purchased_at, 'YYYY-MM') ORDER BY month ASC
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
      <StatsContent
        stock={stock}
        topStores={topStores}
        monthlySpending={monthlySpending}
        totalProducts={totalProducts}
        topProducts={topProducts}
        categorySpend={categorySpend}
        totalThisMonth={totalThisMonth}
        insights={insights}
        fullPct={fullPct}
        halfPct={halfPct}
        emptyPct={emptyPct}
        maxTrips={maxTrips}
        maxSpend={maxSpend}
      />
    </div>
  );
}
