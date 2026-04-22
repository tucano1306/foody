'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const COLORS = [
  '#f97316', // orange
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#10b981', // emerald
  '#ef4444', // red
  '#eab308', // yellow
  '#ec4899', // pink
  '#64748b', // slate
];

const CATEGORY_LABELS: Record<string, string> = {
  utilities: 'Servicios',
  subscriptions: 'Suscripciones',
  rent: 'Renta',
  insurance: 'Seguros',
  internet: 'Internet',
  phone: 'Teléfono',
  streaming: 'Streaming',
  other: 'Otros',
};

function labelFor(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

interface Slice {
  readonly category: string;
  readonly total: number;
  readonly count: number;
}

interface Props {
  readonly data: readonly Slice[];
}

export default function ExpensesChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.total, 0);

  const chartData = data.map((d, i) => ({
    name: labelFor(d.category),
    value: d.total,
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
                'Monto',
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
            Total / mes
          </span>
          <span className="text-lg font-bold text-stone-800">
            ${total.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex-1 w-full space-y-1.5">
        {chartData.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 text-stone-700 truncate">{s.name}</span>
            <span className="text-stone-500 text-xs tabular-nums">
              ${s.value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            </span>
            <span className="w-10 text-right text-xs font-semibold text-stone-400 tabular-nums">
              {s.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
