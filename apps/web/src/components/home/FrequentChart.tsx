'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface Item {
  readonly productId: string;
  readonly name: string;
  readonly purchases: number;
  readonly lastPurchasedAt: string;
}

interface Props {
  readonly items: readonly Item[];
}

function formatRelative(iso: string): string {
  const diffDays = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem`;
  return `hace ${Math.floor(diffDays / 30)} mes`;
}

export default function FrequentChart({ items }: Props) {
  const chartData = items.map((i) => ({
    name: i.name.length > 18 ? i.name.slice(0, 17) + '…' : i.name,
    fullName: i.name,
    purchases: i.purchases,
    last: formatRelative(i.lastPurchasedAt),
  }));

  return (
    <div style={{ width: '100%', height: chartData.length * 44 + 20 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
        >
          <defs>
            <linearGradient id="bar-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#57534e' }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(251,146,60,0.08)' }}
            formatter={(value: number) => [`${value}x`, 'Compras']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e7e5e4',
              fontSize: 12,
            }}
          />
          <Bar dataKey="purchases" radius={[6, 6, 6, 6]}>
            {chartData.map((entry) => (
              <Cell key={entry.fullName} fill="url(#bar-gradient)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
