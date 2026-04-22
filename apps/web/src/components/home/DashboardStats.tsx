interface Props {
  readonly totalProducts: number;
  readonly runningLowCount: number;
  readonly upcomingPaymentsCount: number;
  readonly totalMonthlyExpenses: number;
}

interface Stat {
  readonly label: string;
  readonly value: string | number;
  readonly sublabel: string;
  readonly icon: string;
  readonly color: string;
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
      color: '#0ea5e9', // sky-500
    },
    {
      label: 'Stock bajo',
      value: runningLowCount,
      sublabel: runningLowCount === 0 ? 'todo en orden' : 'requieren reposición',
      icon: '⚠️',
      color: runningLowCount > 0 ? '#f59e0b' : '#a7ce39', // amber-500 / energy
    },
    {
      label: 'Pagos próximos',
      value: upcomingPaymentsCount,
      sublabel: upcomingPaymentsCount === 0 ? 'sin vencimientos' : 'vencen esta semana',
      icon: '💳',
      color: upcomingPaymentsCount > 0 ? '#ef4444' : '#a7ce39', // red-500 / energy
    },
    {
      label: 'Gasto del mes',
      value: `$${totalMonthlyExpenses.toFixed(0)}`,
      sublabel: 'presupuesto estimado',
      icon: '💰',
      color: '#003b71', // brand-600
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="group flex flex-col items-center text-center bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3 shadow-md transition-transform duration-300 group-hover:scale-110"
            style={{
              backgroundColor: stat.color,
              boxShadow: `0 8px 20px -6px ${stat.color}`,
            }}
            aria-hidden="true"
          >
            <span className="text-xl sm:text-2xl leading-none">{stat.icon}</span>
          </div>
          <h3 className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-stone-500 leading-tight">
            {stat.label}
          </h3>
          <p className="stat-value mt-2 text-2xl sm:text-3xl font-extrabold text-stone-900 leading-none break-all">
            {stat.value}
          </p>
          <p className="mt-1.5 text-[10px] sm:text-xs text-stone-400 truncate max-w-full">
            {stat.sublabel}
          </p>
        </div>
      ))}
    </div>
  );
}
