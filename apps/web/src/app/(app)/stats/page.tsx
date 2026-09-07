import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { buildStatsSummary } from '@/lib/stats-engine';
import { loadGroceryInsight } from '@/lib/finance-data';
import { EMPTY_GROCERY_INSIGHT, type GroceryInsight } from '@/lib/grocery-insights';
import { ensureTripSplitsSchema } from '@/lib/ensure-schema';
import ModernTitle from '@/components/layout/ModernTitle';
import StatsContent from '@/components/stats/StatsContent';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Estadísticas — Foody' };

interface TopProduct { name: string; purchases: number; totalQty: number; }

interface StatsData {
  stock: { full: number; half: number; empty: number };
  topStores: { name: string; trips: number; totalSpent: number }[];
  monthlySpending: { month: string; total: number; trips: number }[];
  totalProducts: number;
  topProducts: TopProduct[];
  groceries: GroceryInsight;
  totalThisMonth: number;
  totalLastMonth: number;
}

async function getStats(userId: string): Promise<StatsData> {
  // Stats mide la DESPENSA: solo tickets de super. Comer fuera, la farmacia o
  // la gasolina son gasto del Plan Financiero y ensuciarían cada promedio.
  await ensureTripSplitsSchema();

  // Per-user isolation
  const productScope = sql`user_id = ${userId}`;
  const ppScope = sql`pp.user_id = ${userId}`;

  // Spending/visit queries combine two sources without double counting:
  // formal trips (their total_spent is what was actually paid, tax included)
  // plus loose purchases with no trip (legacy scans), grouped into one
  // "visit" per shared batch timestamp. Counting raw product_purchases rows
  // would report line items as visits and re-count itemized trip contents.
  const [stockRows, storeRows, monthRows, totalRows, topProductRows, groceries] = await Promise.all([
    sql`SELECT stock_level, COUNT(*) AS count FROM products WHERE ${productScope} GROUP BY stock_level`,
    sql`
      SELECT name, COUNT(*) AS trips, SUM(total) AS total_spent
      FROM (
        -- La VISTA y no la tabla: un ticket de super con una
        -- parte repartida a farmacia cuenta aqui solo por lo que quedo EN
        -- DESPENSA. Leyendo la tabla, Publix salia por $204.43 mientras Casa y
        -- el plan decian $182.49 — la misma tienda, dos respuestas.
        SELECT COALESCE(store_name, 'Sin tienda') AS name, amount AS total
        FROM trip_kind_amounts WHERE user_id = ${userId} AND kind = 'grocery'
        UNION ALL
        SELECT COALESCE(store_name, 'Sin tienda') AS name,
          SUM(COALESCE(total_price, unit_price * quantity, 0)) AS total
        FROM product_purchases
        WHERE user_id = ${userId} AND trip_id IS NULL
        GROUP BY COALESCE(store_name, 'Sin tienda'), purchased_at
      ) visits
      GROUP BY name ORDER BY trips DESC LIMIT 5
    `,
    sql`
      SELECT month, SUM(total) AS total, COUNT(*) AS trips
      FROM (
        -- Mismo motivo: septiembre salia $51.16 aqui y $29.22 en Casa.
        SELECT TO_CHAR(date, 'YYYY-MM') AS month, amount AS total
        FROM trip_kind_amounts
        WHERE user_id = ${userId} AND kind = 'grocery' AND date >= NOW() - INTERVAL '6 months'
        UNION ALL
        SELECT TO_CHAR(purchased_at, 'YYYY-MM') AS month,
          SUM(COALESCE(total_price, unit_price * quantity, 0)) AS total
        FROM product_purchases
        WHERE user_id = ${userId} AND trip_id IS NULL
          AND purchased_at >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR(purchased_at, 'YYYY-MM'), purchased_at
      ) sessions
      GROUP BY month ORDER BY month ASC
    `,
    sql`SELECT COUNT(*) AS count FROM products WHERE ${productScope}`,
    sql`
      SELECT p.name, COUNT(pp.id) AS purchases, SUM(pp.quantity) AS total_qty
      FROM product_purchases pp
      JOIN products p ON p.id = pp.product_id
      -- Solo ítems de tickets de super: los de un ticket reclasificado a
      -- "comida fuera" dejan de ser despensa.
      LEFT JOIN shopping_trips t ON t.id = pp.trip_id
      WHERE ${ppScope}
        AND (pp.trip_id IS NULL OR t.kind = 'grocery')
      GROUP BY p.name
      ORDER BY purchases DESC
      LIMIT 8
    `,
    // El MISMO desglose que lee el Plan financiero. Cuando esta página tenía su
    // propia consulta las dos derivaban: la copia de aquí no traía el arreglo de
    // las categorías en cadena vacía y, sobre todo, no tenía la fila de «Sin
    // detallar» — enseñaba $49.90 de un mes de $176.94 sin decir que faltaban.
    loadGroceryInsight(userId),
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
    groceries,
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
    totalThisMonth,
    totalLastMonth,
  };
}

export default async function StatsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) redirect('/login');

  let data: StatsData;
  try {
    data = await getStats(session.userId);
  } catch {
    data = {
      stock: { full: 0, half: 0, empty: 0 },
      topStores: [], monthlySpending: [], totalProducts: 0,
      topProducts: [], groceries: EMPTY_GROCERY_INSIGHT, totalThisMonth: 0, totalLastMonth: 0,
    };
  }

  const { stock, topStores, monthlySpending, totalProducts, topProducts, groceries, totalThisMonth, totalLastMonth } = data;
  // Los cálculos viven en stats-engine.ts, probado aparte: porcentajes que
  // suman 100 exactos, divisores que nunca son 0 y conclusiones ordenadas por
  // magnitud (con tope de 4, que salgan las que más se movieron).
  const summary = buildStatsSummary({
    stock,
    months: monthlySpending,
    // Las mismas categorías que se pintan: antes el resumen leía una
    // consulta y la lista otra.
    categories: groceries.categories,
    stores: topStores,
  });
  const { fullPct, halfPct, emptyPct } = summary.stock;
  const { maxTrips, maxSpend } = summary;
  const insights = summary.insights.map((i) => `${i.icon} ${i.text}`);

  return (
    <div className="space-y-6">
      <ModernTitle
        title="Estadísticas"
      />
      <StatsContent
        stock={stock}
        topStores={topStores}
        monthlySpending={monthlySpending}
        totalProducts={totalProducts}
        topProducts={topProducts}
        groceries={groceries}
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
