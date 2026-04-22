'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  readonly currentMode?: 'home' | 'supermarket';
}

export default function ModeToggle({ currentMode }: Props) {
  const pathname = usePathname();
  const mode =
    currentMode ?? (pathname.startsWith('/supermarket') ? 'supermarket' : 'home');
  const isSuper = mode === 'supermarket';
  const isHome = !isSuper;

  return (
    <div
      role="tablist"
      aria-label="Modo de uso"
      className="relative inline-flex items-center p-1 bg-white rounded-2xl border border-stone-200 shadow-sm"
    >
      {/* Animated indicator */}
      <span
        aria-hidden
        className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-xl transition-all duration-300 ease-out ${
          isSuper
            ? 'left-[calc(50%+0.125rem)] bg-linear-to-br from-market-500 to-market-700 shadow-md shadow-market-500/30'
            : 'left-1 bg-linear-to-br from-brand-400 to-brand-600 shadow-md shadow-brand-500/30'
        }`}
      />

      <Link
        href="/home"
        role="tab"
        aria-selected={isHome}
        className={`relative z-10 flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${
          isHome ? 'text-white' : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        🏠 <span>Casa</span>
      </Link>
      <Link
        href="/supermarket"
        role="tab"
        aria-selected={isSuper}
        className={`relative z-10 flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${
          isSuper ? 'text-white' : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        🛒 <span>Super</span>
      </Link>
    </div>
  );
}
