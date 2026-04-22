'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  readonly currentMode?: 'home' | 'supermarket';
  readonly onDark?: boolean;
}

export default function ModeToggle({ currentMode, onDark = false }: Readonly<Props>) {
  const pathname = usePathname();
  const mode =
    currentMode ?? (pathname.startsWith('/supermarket') ? 'supermarket' : 'home');
  const isSuper = mode === 'supermarket';
  const isHome = !isSuper;

  const containerCls = onDark
    ? 'bg-white/10 border-white/20 backdrop-blur-sm'
    : 'bg-white border-stone-200';

  const inactiveCls = onDark
    ? 'text-white/70 hover:text-white'
    : 'text-stone-500 hover:text-stone-700';

  const homeActiveCls = 'text-white';
  const superActiveCls = onDark ? 'text-brand-900' : 'text-white';
  const homeCls = isHome ? homeActiveCls : inactiveCls;
  const superCls = isSuper ? superActiveCls : inactiveCls;

  return (
    <div
      role="tablist"
      aria-label="Modo de uso"
      className={`relative inline-flex items-center p-1 rounded-2xl border shadow-sm ${containerCls}`}
    >
      {/* Animated indicator */}
      <span
        aria-hidden
        className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl transition-all duration-300 ease-out ${
          isSuper
            ? 'left-[calc(50%+0.125rem)] bg-linear-to-br from-energy-400 to-energy-500 shadow-md shadow-energy-500/30'
            : 'left-1 bg-linear-to-br from-sky-400 to-sky-600 shadow-md shadow-sky-500/30'
        }`}
      />

      <Link
        href="/home"
        role="tab"
        aria-selected={isHome}
        className={`relative z-10 flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${homeCls}`}
      >
        <span>🏠</span>
        <span>Casa</span>
      </Link>
      <Link
        href="/supermarket"
        role="tab"
        aria-selected={isSuper}
        className={`relative z-10 flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${superCls}`}
      >
        <span>🛒</span>
        <span>Super</span>
      </Link>
    </div>
  );
}
