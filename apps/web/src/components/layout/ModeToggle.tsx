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

  const btnCls = onDark
    ? 'bg-white/15 border border-white/25 text-white hover:bg-white/25 backdrop-blur-sm'
    : 'bg-brand-600 border border-brand-700 text-white hover:bg-brand-700';

  if (isSuper) {
    return (
      <Link
        href="/home"
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold transition-all shadow-sm ${btnCls}`}
      >
        <span>🏠</span>
        <span>Modo Casa</span>
      </Link>
    );
  }

  return (
    <Link
      href="/supermarket"
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold transition-all shadow-sm ${btnCls}`}
    >
      <span>🛒</span>
      <span>Ir al Super</span>
    </Link>
  );
}
