'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface Props {
  readonly totalProducts: number;
  readonly runningLowCount: number;
}

interface Stat {
  readonly label: string;
  readonly value: string | number;
  readonly sublabel: string;
  readonly icon: string;
  readonly color: string;
  readonly href: string;
}

/**
 * Los números de la DESPENSA. Nada de pagos: eso vive en Pagos, Deudas y Plan
 * financiero, cada uno con su sección en el menú, y repetirlo aquí solo daba
 * una cifra de menor calidad a un toque de la buena.
 */
export default function DashboardStats({
  totalProducts,
  runningLowCount,
}: Readonly<Props>) {
  const stats: readonly Stat[] = [
    {
      label: 'Productos en despensa',
      value: totalProducts,
      sublabel: totalProducts === 1 ? 'artículo registrado' : 'artículos registrados',
      icon: '📦',
      color: '#0ea5e9',
      href: '/products',
    },
    {
      label: 'Stock bajo',
      value: runningLowCount,
      sublabel: runningLowCount === 0 ? 'todo en orden' : 'requieren reposición',
      icon: '⚠️',
      color: runningLowCount > 0 ? '#3b82f6' : '#0ea5e9',
      href: '/products?filter=low',
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 gap-3 sm:gap-4"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
    >
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          variants={{ hidden: { opacity: 0, y: 24, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1 } }}
          transition={{ type: 'spring', stiffness: 340, damping: 22 }}
          whileHover="card_hovered"
          whileTap="card_tapped"
        >
          <Link
            href={stat.href}
            className="flex flex-col items-center text-center bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-lg active:scale-95 transition-[box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <motion.div
              className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3 shadow-md"
              style={{
                backgroundColor: stat.color,
                boxShadow: `0 8px 20px -6px ${stat.color}`,
              }}
              aria-hidden="true"
              variants={{
                card_hovered: { scale: 1.22, rotate: [0, -14, 14, -8, 8, 0], y: -4 },
                card_tapped: { scale: 0.85 },
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 12 }}
            >
              <span className="text-xl sm:text-2xl leading-none">{stat.icon}</span>
            </motion.div>
            <h3 className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 leading-tight">
              {stat.label}
            </h3>
            <p className="stat-value mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none break-all">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[10px] sm:text-xs text-slate-400 truncate max-w-full">
              {stat.sublabel}
            </p>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
