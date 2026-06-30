import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

// GET /api/stats — summary stats for the current user
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const userId = user.userId;

  // Stock overview
  const stockRows = await sql`
    SELECT stock_level, COUNT(*) AS count
    FROM products
    WHERE user_id = ${userId}
    GROUP BY stock_level
  `;
  const stock = { full: 0, half: 0, empty: 0 };
  for (const row of stockRows as { stock_level: string; count: string }[]) {
    const lvl = row.stock_level as keyof typeof stock;
    if (lvl in stock) stock[lvl] = Number.parseInt(row.count, 10);
  }

  // Top stores by number of shopping trips
  const storeRows = await sql`
    SELECT
      COALESCE(store_name, 'Sin nombre') AS name,
      COUNT(*) AS trips,
      SUM(total_spent) AS total_spent
    FROM shopping_trips
    WHERE user_id = ${userId}
    GROUP BY COALESCE(store_name, 'Sin nombre')
    ORDER BY trips DESC
    LIMIT 5
  `;
  const topStores = (storeRows as { name: string; trips: string; total_spent: string }[]).map(
    (r) => ({
      name: r.name,
      trips: Number.parseInt(r.trips, 10),
      totalSpent: Number.parseFloat(r.total_spent ?? '0'),
    }),
  );

  // Monthly spending (last 6 months)
  const monthRows = await sql`
    SELECT
      TO_CHAR(date, 'YYYY-MM') AS month,
      SUM(total_spent) AS total,
      COUNT(*) AS trips
    FROM shopping_trips
    WHERE user_id = ${userId}
      AND date >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(date, 'YYYY-MM')
    ORDER BY month ASC
  `;
  const monthlySpending = (monthRows as { month: string; total: string; trips: string }[]).map(
    (r) => ({
      month: r.month,
      total: Number.parseFloat(r.total ?? '0'),
      trips: Number.parseInt(r.trips, 10),
    }),
  );

  // Total products count
  const totalRows = await sql`SELECT COUNT(*) AS count FROM products WHERE user_id = ${userId}`;
  const totalProducts = Number.parseInt((totalRows[0] as { count: string }).count, 10);

  return NextResponse.json({ stock, topStores, monthlySpending, totalProducts });
}
