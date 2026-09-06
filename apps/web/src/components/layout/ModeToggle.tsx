'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, ShoppingCartIcon } from '@heroicons/react/24/solid';

interface Props {
  readonly currentMode?: 'home' | 'supermarket';
  readonly onDark?: boolean;
}

/**
 * Salto entre Modo Casa y Modo Supermercado.
 *
 * Solo en escritorio. En móvil, Casa y Súper son dos pestañas de la barra
 * inferior, así que este botón sería un segundo camino al mismo sitio, a dos
 * centímetros del primero — justo el tipo de duplicado que hace dudar («¿son
 * lo mismo estos dos?»). Arriba, donde no hay barra de pestañas, sigue siendo
 * el atajo entre los dos modos.
 */
export default function ModeToggle({ currentMode, onDark = false }: Readonly<Props>) {
  const pathname = usePathname();
  const mode = currentMode ?? (pathname.startsWith('/supermarket') ? 'supermarket' : 'home');
  const isSuper = mode === 'supermarket';

  const cls = onDark
    ? 'bg-white/15 border border-white/25 text-white hover:bg-white/25 backdrop-blur-sm'
    : 'btn-soft border border-[var(--line)]';

  return (
    <Link
      href={isSuper ? '/home' : '/supermarket'}
      className={`hidden md:inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold ${cls}`}
    >
      {isSuper ? (
        <HomeIcon className="w-[18px] h-[18px]" />
      ) : (
        <ShoppingCartIcon className="w-[18px] h-[18px]" />
      )}
      {isSuper ? 'Modo Casa' : 'Ir al Súper'}
    </Link>
  );
}
