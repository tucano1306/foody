'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const COLORS = [
  '#0ea5e9',
  '#f97316',
  '#a855f7',
  '#10b981',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#64748b',
];

interface Slice {
  readonly storeName: string;
  readonly total: number;
  readonly count: number;
}

interface Props {
  readonly data: readonly Slice[];
}

export default function StoreExpensesChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  if (total === 0) return null;

  const chartData = data.map((d, i) => ({
    name: d.storeName,
    value: d.total,
    count: d.count,
    pct: (d.total / total) * 100,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      {/* Donut */}
      <div className="relative shrink-0 w-45 h-45">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [
                `$${value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`,
                'Gastado',
              ]}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #e7e5e4',
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wide text-stone-400 font-semibold">
            Total
          </span>
          <span className="text-lg font-bold text-stone-800">
            ${total.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex-1 w-full space-y-1.5 text-sm">
        {chartData.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="flex-1 truncate text-stone-700">{d.name}</span>
            <span className="text-xs text-stone-400">
              {d.count} {d.count === 1 ? 'ticket' : 'tickets'}
            </span>
            <span className="font-semibold text-stone-800 tabular-nums">
              ${d.value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs text-stone-400 w-10 text-right tabular-nums">
              {d.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
