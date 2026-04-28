'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
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
} from '@heroicons/react/24/solid';

const NAV_ITEMS = [
  { href: '/home',           icon: HomeIcon,           label: 'Casa' },
  { href: '/supermarket',    icon: ShoppingCartIcon,   label: 'Super' },
  { href: '/products',       icon: CubeIcon,           label: 'Productos' },
  { href: '/shopping-trips', icon: ReceiptPercentIcon, label: 'Compras' },
  { href: '/payments',       icon: CreditCardIcon,     label: 'Pagos' },
  { href: '/stats',          icon: ChartBarIcon,       label: 'Stats' },
  { href: '/household',      icon: BuildingOfficeIcon, label: 'Hogar' },
];

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  readonly href: string;
  readonly icon: React.ElementType;
  readonly label: string;
  readonly active: boolean;
  readonly onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover="hovered"
      whileTap="tapped"
      className="rounded-xl"
    >
      <Link
        href={href}
        onClick={onClick}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors group ${
          active
            ? 'bg-indigo-600/20 text-indigo-300'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/80'
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
              active ? 'text-indigo-400' : 'text-gray-500 group-hover:text-indigo-400'
            }`}
          />
        </motion.div>
        <span>{label}</span>
        {active && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
        )}
      </Link>
    </motion.div>
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

  return (
    <>
      {/* ─── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-gray-950 border-r border-gray-800 shadow-xl z-40 overflow-y-auto">
        <div className="flex items-center gap-3 px-6 pt-7 pb-6">
          <Image src="/logo.png" alt="Foody" width={36} height={36} className="object-contain drop-shadow-md" priority />
          <h1 className="text-2xl font-bold bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
            Foody
          </h1>
        </div>

        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}
        </nav>

        <div className="px-4 pb-7 pt-5 border-t border-gray-800 mt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {user.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={user.name ?? user.email}
                  width={38}
                  height={38}
                  className="rounded-full ring-2 ring-indigo-500/30 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 flex items-center justify-center text-white text-base font-bold ring-2 ring-indigo-500/30 shrink-0">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{user.name ?? user.email}</p>
                <p className="text-gray-500 text-xs truncate">{user.email}</p>
              </div>
            </div>
            <form action="/api/auth/logout" method="POST">
              <motion.button
                type="submit"
                title="Cerrar sesión"
                className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
                whileHover={{ scale: 1.15, x: 3 }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                <ArrowLeftStartOnRectangleIcon className="w-5 h-5" />
              </motion.button>
            </form>
          </div>
        </div>
      </aside>

      {/* ─── Mobile: top bar + slide drawer ────────────────────────────────── */}
      <div className="md:hidden">
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-gray-950/95 backdrop-blur border-b border-gray-800 shadow-lg">
          <Link href="/home" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Foody" width={28} height={28} className="object-contain drop-shadow-md" priority />
            <span className="text-lg font-bold bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Foody
            </span>
          </Link>
          <motion.button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
            aria-label="Abrir menú"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85, rotate: 90 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <Bars3Icon className="w-6 h-6" />
          </motion.button>
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
          className={`fixed top-0 left-0 z-50 h-full w-72 bg-gray-950 border-r border-gray-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pt-6 pb-5">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Foody" width={32} height={32} className="object-contain drop-shadow-md" />
              <span className="text-xl font-bold bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Foody
              </span>
            </div>
            <motion.button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
              aria-label="Cerrar"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <XMarkIcon className="w-5 h-5" />
            </motion.button>
          </div>

          <nav className="flex flex-col gap-1 px-3 flex-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive(item.href)}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </nav>

          <div className="px-4 pb-8 pt-5 border-t border-gray-800 mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.name ?? user.email}
                    width={38}
                    height={38}
                    className="rounded-full ring-2 ring-indigo-500/30 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-linear-to-r from-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold shrink-0">
                    {initial}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{user.name ?? user.email}</p>
                  <p className="text-gray-500 text-xs truncate">{user.email}</p>
                </div>
              </div>
              <form action="/api/auth/logout" method="POST">
                <motion.button
                  type="submit"
                  title="Cerrar sesión"
                  className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
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
