'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutGroup, motion } from 'framer-motion';
import {
  HomeIcon,
  ShoppingCartIcon,
  CubeIcon,
  ReceiptPercentIcon,
  CreditCardIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  ArrowLeftStartOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ShareIcon,
  BanknotesIcon,
  FlagIcon,
} from '@heroicons/react/24/solid';
import ThemeToggle from './ThemeToggle';

import SharingBadge from '@/components/sharing/SharingBadge';

const NAV_SECTIONS = [
  {
    label: 'Tu cocina',
    items: [
      { href: '/home',           icon: HomeIcon,           label: 'Casa' },
      { href: '/supermarket',    icon: ShoppingCartIcon,   label: 'Super' },
      { href: '/products',       icon: CubeIcon,           label: 'Productos' },
      { href: '/shopping-trips', icon: ReceiptPercentIcon, label: 'Compras' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { href: '/budget',   icon: BanknotesIcon,  label: 'Presupuesto' },
      { href: '/payments', icon: CreditCardIcon, label: 'Pagos' },
      { href: '/plan',     icon: FlagIcon,       label: 'Plan financiero' },
    ],
  },
  {
    label: 'Tu mundo',
    items: [
      { href: '/stats',     icon: ChartBarIcon,       label: 'Stats' },
      { href: '/household', icon: BuildingOfficeIcon, label: 'Hogar' },
      { href: '/sharing',   icon: ShareIcon,          label: 'Compartir' },
    ],
  },
];

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  showBadge,
  onClick,
}: {
  readonly href: string;
  readonly icon: React.ElementType;
  readonly label: string;
  readonly active: boolean;
  readonly showBadge?: boolean;
  readonly onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover="hovered"
      whileTap="tapped"
      className="relative rounded-xl"
    >
      {/* Sliding pill: one shared element glides between active items */}
      {active && (
        <motion.span
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-xl bg-white dark:bg-white/10 border border-sky-200/70 dark:border-white/10 shadow-sm"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          aria-hidden="true"
        />
      )}
      <Link
        href={href}
        onClick={onClick}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors group ${
          active
            ? 'text-brand-700 dark:text-white font-semibold'
            : 'text-navy-500 dark:text-navy-200 font-medium hover:text-brand-700 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
        }`}
      >
        <motion.div
          variants={{
            hovered: { scale: 1.35, rotate: -14, y: -2 },
            tapped: { scale: 0.75 },
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 16 }}
        >
          <Icon
            className={`w-5 h-5 shrink-0 transition-colors ${
              active
                ? 'text-brand-600 dark:text-cyan-300'
                : 'text-navy-300 dark:text-navy-400 group-hover:text-brand-500 dark:group-hover:text-cyan-400'
            }`}
          />
        </motion.div>
        <span>{label}</span>
        {active && !showBadge && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-energy-500 shrink-0" />
        )}
        {showBadge && <SharingBadge />}
      </Link>
    </motion.div>
  );
}

function NavSections({ isActive, onNavigate }: { readonly isActive: (href: string) => boolean; readonly onNavigate?: () => void }) {
  return (
    <>
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-navy-400/80 dark:text-navy-300/60 select-none">
            {section.label}
          </p>
          {section.items.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(item.href)}
              showBadge={item.href === '/sharing'}
              onClick={onNavigate}
            />
          ))}
        </div>
      ))}
    </>
  );
}

interface Props {
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}

export default function Navbar({ user }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  const logoTextCls =
    'bg-linear-to-r from-brand-600 to-sky-500 dark:from-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent';

  return (
    <>
      {/* ─── Desktop sidebar (pastel blue) ──────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-linear-to-b from-sky-100 via-blue-50 to-indigo-100 dark:from-navy-800 dark:via-navy-900 dark:to-navy-900 border-r border-sky-200/70 dark:border-navy-700 shadow-xl z-40 overflow-y-auto">
        <div className="flex items-center gap-4 px-6 pt-8 pb-3">
          <Image src="/logo.png" alt="Foody" width={52} height={52} className="object-contain drop-shadow-md" priority />
          <h1 className={`text-3xl font-black tracking-tight ${logoTextCls}`}>
            Foody
          </h1>
        </div>

        <nav className="flex flex-col gap-1 px-3 flex-1 pb-4">
          <LayoutGroup id="nav-desktop">
            <NavSections isActive={isActive} />
          </LayoutGroup>
        </nav>

        <div className="px-4 pb-7 pt-5 border-t border-sky-200/70 dark:border-navy-700 mt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name ?? user.email}
                  width={38}
                  height={38}
                  className="rounded-full ring-2 ring-brand-300/50 dark:ring-indigo-500/30 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-linear-to-r from-brand-500 to-sky-400 flex items-center justify-center text-white text-base font-bold ring-2 ring-brand-300/50 dark:ring-indigo-500/30 shrink-0">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-navy-800 dark:text-white text-sm font-medium truncate">{user.name ?? user.email}</p>
                <p className="text-navy-400 dark:text-navy-300 text-xs truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">

              <ThemeToggle />
              <form action="/api/auth/logout" method="POST">
                <motion.button
                  type="submit"
                  title="Cerrar sesión"
                  className="text-navy-400 hover:text-rose-500 dark:text-navy-300 dark:hover:text-rose-400 transition-colors"
                  whileHover={{ scale: 1.15, x: 3 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <ArrowLeftStartOnRectangleIcon className="w-5 h-5" />
                </motion.button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Mobile: top bar + slide drawer ────────────────────────────────── */}
      <div className="md:hidden">
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-16 bg-sky-100/95 dark:bg-navy-900/95 backdrop-blur border-b border-sky-200 dark:border-navy-700 shadow-lg">
          <Link href="/home" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Foody" width={36} height={36} className="object-contain drop-shadow-md" priority />
            <span className={`text-xl font-black ${logoTextCls}`}>
              Foody
            </span>
          </Link>
          <div className="flex items-center gap-2">

            <ThemeToggle />
            <motion.button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-xl text-navy-500 dark:text-navy-200 hover:text-brand-700 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition"
              aria-label="Abrir menú"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.85, rotate: 90 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Bars3Icon className="w-6 h-6" />
            </motion.button>
          </div>
        </header>

        {mobileOpen && (
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm cursor-default"
            onClick={() => setMobileOpen(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setMobileOpen(false); }}
          />
        )}

        <div
          className={`fixed top-0 left-0 z-50 h-full w-72 bg-linear-to-b from-sky-100 via-blue-50 to-indigo-100 dark:from-navy-800 dark:via-navy-900 dark:to-navy-900 border-r border-sky-200 dark:border-navy-700 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-6 pb-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Foody" width={32} height={32} className="object-contain drop-shadow-md" priority />
              <span className={`text-xl font-bold ${logoTextCls}`}>
                Foody
              </span>
            </div>
            <motion.button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-xl text-navy-500 dark:text-navy-200 hover:text-brand-700 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition"
              aria-label="Cerrar"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <XMarkIcon className="w-5 h-5" />
            </motion.button>
          </div>

          <nav className="flex flex-col gap-1 px-3 flex-1 overflow-y-auto pb-4">
            <LayoutGroup id="nav-mobile">
              <NavSections isActive={isActive} onNavigate={() => setMobileOpen(false)} />
            </LayoutGroup>
          </nav>

          <div className="px-4 pb-8 pt-5 border-t border-sky-200/70 dark:border-navy-700 mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.name ?? user.email}
                    width={38}
                    height={38}
                    className="rounded-full ring-2 ring-brand-300/50 dark:ring-indigo-500/30 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-linear-to-r from-brand-500 to-sky-400 flex items-center justify-center text-white font-bold shrink-0">
                    {initial}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-navy-800 dark:text-white text-sm font-medium truncate">{user.name ?? user.email}</p>
                  <p className="text-navy-400 dark:text-navy-300 text-xs truncate">{user.email}</p>
                </div>
              </div>
              <form action="/api/auth/logout" method="POST">
                <motion.button
                  type="submit"
                  title="Cerrar sesión"
                  className="text-navy-400 hover:text-rose-500 dark:text-navy-300 dark:hover:text-rose-400 transition-colors shrink-0"
                  whileHover={{ scale: 1.15, x: 3 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <ArrowLeftStartOnRectangleIcon className="w-5 h-5" />
                </motion.button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
