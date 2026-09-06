'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { CubeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import type { ElementType } from 'react';

interface Props {
  readonly totalProducts: number;
  readonly runningLowCount: number;
}

interface Stat {
  readonly label: string;
  readonly value: number;
  readonly sublabel: string;
  readonly icon: ElementType;
  readonly href: string;
  /** Resalta la tarjeta cuando el número pide que hagas algo. */
  readonly urgent?: boolean;
}

/**
 * Los números de la DESPENSA. Nada de pagos: eso vive en Pagos, Deudas y Plan
 * financiero, cada uno con su sección en el menú, y repetirlo aquí solo daba
 * una cifra de menor calidad a un toque de la buena.
 *
 * El número manda. Antes la tarjeta ponía primero un círculo de color de 56 px
 * con un emoji dentro, luego la etiqueta en MAYÚSCULAS diminutas, luego la
 * cifra y luego otra línea de texto: cuatro elementos por encima del único dato
 * que se venía a mirar. Ahora la cifra va arriba y grande, y el icono es una
 * marca discreta en la esquina.
 */
export default function DashboardStats({
  totalProducts,
  runningLowCount,
}: Readonly<Props>) {
  const stats: readonly Stat[] = [
    {
      label: 'En la despensa',
      value: totalProducts,
      sublabel: totalProducts === 1 ? 'producto' : 'productos',
      icon: CubeIcon,
      href: '/products',
    },
    {
      label: 'Por reponer',
      value: runningLowCount,
      sublabel: runningLowCount === 0 ? 'todo en orden' : 'se están acabando',
      icon: ExclamationTriangleIcon,
      href: '/products?filter=low',
      urgent: runningLowCount > 0,
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 gap-3"
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          >
            <Link
              href={stat.href}
              className={`group relative flex flex-col justify-between h-full overflow-hidden rounded-[var(--radius-card)] p-4 sm:p-5 border shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 ${
                stat.urgent
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-[var(--surface)] border-[var(--line)]'
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`absolute -right-3 -top-3 w-20 h-20 ${
                  stat.urgent ? 'text-white/15' : 'text-[var(--accent)]/[0.07]'
                }`}
              />

              <p
                className={`stat-value relative text-4xl sm:text-5xl font-extrabold leading-none ${
                  stat.urgent ? 'text-white' : 'text-[var(--ink)]'
                }`}
              >
                {stat.value}
              </p>

              <div className="relative mt-3">
                <p
                  className={`text-sm font-bold leading-tight ${
                    stat.urgent ? 'text-white' : 'text-[var(--ink)]'
                  }`}
                >
                  {stat.label}
                </p>
                <p
                  className={`text-xs mt-0.5 leading-tight ${
                    stat.urgent ? 'text-white/75' : 'text-[var(--ink-subtle)]'
                  }`}
                >
                  {stat.sublabel}
                </p>
              </div>

              {/* La flecha aparece al pasar el dedo/ratón: dice «esto lleva a
                  algún sitio» sin gastar una línea de texto en decirlo. */}
              <ArrowRightIcon
                aria-hidden="true"
                className={`absolute bottom-4 right-4 w-4 h-4 opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 ${
                  stat.urgent ? 'text-white' : 'text-[var(--accent)]'
                }`}
              />
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
