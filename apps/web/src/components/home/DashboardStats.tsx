'use client';

import { motion } from 'framer-motion';

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
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
    >
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          variants={{ hidden: { opacity: 0, y: 24, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1 } }}
          transition={{ type: 'spring', stiffness: 340, damping: 22 }}
          className="group flex flex-col items-center text-center bg-white rounded-2xl p-4 sm:p-5 border border-stone-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 ease-out"
        >
          <motion.div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3 shadow-md"
            style={{
              backgroundColor: stat.color,
              boxShadow: `0 8px 20px -6px ${stat.color}`,
            }}
            aria-hidden="true"
            whileHover={{ scale: 1.2, rotate: [0, -10, 10, -6, 6, 0] }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <span className="text-xl sm:text-2xl leading-none">{stat.icon}</span>
          </motion.div>
          <h3 className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-stone-500 leading-tight">
            {stat.label}
          </h3>
          <p className="stat-value mt-2 text-2xl sm:text-3xl font-extrabold text-stone-900 leading-none break-all">
            {stat.value}
          </p>
          <p className="mt-1.5 text-[10px] sm:text-xs text-stone-400 truncate max-w-full">
            {stat.sublabel}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}
