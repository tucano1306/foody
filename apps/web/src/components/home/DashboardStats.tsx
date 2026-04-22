interface Props {
  totalProducts: number;
  runningLowCount: number;
  shoppingListCount: number;
  upcomingPaymentsCount: number;
  totalMonthlyExpenses: number;
}

export default function DashboardStats({
  totalProducts,
  runningLowCount,
  upcomingPaymentsCount,
  totalMonthlyExpenses,
}: Props) {
  const stats = [
    {
      label: 'Productos',
      value: totalProducts,
      icon: '📦',
      color: 'bg-blue-50 text-blue-700 border-blue-100',
    },
    {
      label: 'Bajo stock',
      value: runningLowCount,
      icon: '⚠️',
      color: runningLowCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-green-50 text-green-700 border-green-100',
    },
    {
      label: 'Pagos urgentes',
      value: upcomingPaymentsCount,
      icon: '💳',
      color: upcomingPaymentsCount > 0 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100',
    },
    {
      label: 'Gasto mensual',
      value: `$${totalMonthlyExpenses.toFixed(0)}`,
      icon: '💰',
      color: 'bg-purple-50 text-purple-700 border-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-2xl border p-4 text-center ${stat.color}`}
        >
          <div className="text-2xl mb-1">{stat.icon}</div>
          <div className="text-2xl font-bold">{stat.value}</div>
          <div className="text-xs font-medium mt-0.5 opacity-75">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
