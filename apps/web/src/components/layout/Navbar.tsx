'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

const NAV_ITEMS = [
  { href: '/home',           emoji: '🏠', text: 'Casa' },
  { href: '/supermarket',    emoji: '🛒', text: 'Super' },
  { href: '/products',       emoji: '📦', text: 'Productos' },
  { href: '/shopping-trips', emoji: '🧾', text: 'Compras' },
  { href: '/payments',       emoji: '💳', text: 'Pagos' },
  { href: '/stats',          emoji: '📊', text: 'Stats' },
  { href: '/household',      emoji: '🏡', text: 'Hogar' },
];

interface Props {
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}

export default function Navbar({ user }: Props) {
  const pathname = usePathname();
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      {/* ─── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-gray-950 border-r border-gray-800 shadow-xl z-40">
        {/* Logo */}
        <div className="flex items-center justify-between px-6 pt-7 pb-6">
          <Link href="/home" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Foody" width={36} height={36} className="object-contain drop-shadow-md" priority />
            <span className="text-2xl font-bold bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
              Foody
            </span>
          </Link>
          <ThemeToggle />
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-300 shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
                }`}
              >
                <span className="text-lg leading-none">{item.emoji}</span>
                <span>{item.text}</span>
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 pb-6 pt-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name ?? user.email}
                width={36}
                height={36}
                className="rounded-full ring-2 ring-indigo-500/30"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white text-sm font-bold ring-2 ring-indigo-500/30">
                {initial}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name ?? user.email}</p>
              <p className="text-gray-500 text-xs truncate">{user.email}</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                title="Cerrar sesión"
                className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none"
              >
                →
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ─── Top bar (tablet / mobile) ──────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-gray-800 shadow-lg">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Foody" width={30} height={30} className="object-contain drop-shadow-md" priority />
            <span className="text-lg font-bold bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Foody
            </span>
          </Link>

          {/* Desktop-ish nav (tablet) */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span>{item.emoji}</span>
                  <span>{item.text}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name ?? user.email}
                width={30}
                height={30}
                className="rounded-full ring-2 ring-indigo-500/40"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white text-xs font-bold">
                {initial}
              </div>
            )}
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-xs text-gray-400 hover:text-red-400 transition px-2 py-1 rounded-md hover:bg-gray-800"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ─── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-gray-950/95 backdrop-blur border-t border-gray-800 pb-[env(safe-area-inset-bottom)] shadow-2xl"
        aria-label="Navegación principal"
      >
        <div className="flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-all ${
                  active
                    ? 'text-indigo-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className={`text-base leading-none transition-transform ${active ? 'scale-110' : ''}`}>
                  {item.emoji}
                </span>
                <span className="truncate max-w-full">{item.text}</span>
                {active && (
                  <span className="w-1 h-1 rounded-full bg-indigo-400 mt-0.5" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
