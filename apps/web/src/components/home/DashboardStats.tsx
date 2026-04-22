interface Props {
  readonly totalProducts: number;
  readonly runningLowCount: number;
  readonly upcomingPaymentsCount: number;
  readonly totalMonthlyExpenses: number;
}

type Accent = 'brand' | 'energy' | 'warn' | 'danger';

interface Stat {
  readonly label: string;
  readonly value: string | number;
  readonly sublabel: string;
  readonly icon: string;
  readonly accent: Accent;
}

export default function DashboardStats({
  totalProducts,
  runningLowCount,
  upcomingPaymentsCount,
  totalMonthlyExpenses,
}: Readonly<Props>) {
  const stats: readonly Stat[] = [
    {
      label: 'Productos en despensa',
      value: totalProducts,
      sublabel: totalProducts === 1 ? 'artículo registrado' : 'artículos registrados',
      icon: '📦',
      accent: 'brand',
    },
    {
      label: 'Stock bajo',
      value: runningLowCount,
      sublabel: runningLowCount === 0 ? 'todo en orden' : 'requieren reposición',
      icon: '⚠️',
      accent: runningLowCount > 0 ? 'warn' : 'energy',
    },
    {
      label: 'Pagos próximos',
      value: upcomingPaymentsCount,
      sublabel: upcomingPaymentsCount === 0 ? 'sin vencimientos' : 'vencen esta semana',
      icon: '💳',
      accent: upcomingPaymentsCount > 0 ? 'danger' : 'energy',
    },
    {
      label: 'Gasto del mes',
      value: `$${totalMonthlyExpenses.toFixed(0)}`,
      sublabel: 'presupuesto estimado',
      icon: '💰',
      accent: 'energy',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="stat-card" data-accent={stat.accent}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-stone-500 leading-tight">
              {stat.label}
            </span>
            <span className="text-lg sm:text-xl leading-none opacity-70">{stat.icon}</span>
          </div>
          <p className="stat-value text-2xl sm:text-3xl font-extrabold text-stone-900 leading-none break-all">
            {stat.value}
          </p>
          <p className="mt-1.5 text-[11px] sm:text-xs text-stone-400 truncate">
            {stat.sublabel}
          </p>
        </div>
      ))}
    </div>
  );
}
