'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutGroup, motion } from 'framer-motion';
import {
  ArrowLeftStartOnRectangleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import ThemeToggle from './ThemeToggle';
import SharingBadge from '@/components/sharing/SharingBadge';
import { NAV_SECTIONS, isActivePath, type NavDestination } from './navigation';
import { openCommandPalette } from './command-palette-bus';

function NavItem({
  item,
  active,
  showBadge,
}: {
  readonly item: NavDestination;
  readonly active: boolean;
  readonly showBadge?: boolean;
}) {
  const Icon = active ? item.iconActive : item.icon;

  return (
    <motion.div whileHover="hovered" className="relative rounded-2xl">
      {/* Píldora deslizante: un único elemento viaja entre secciones. */}
      {active && (
        <motion.span
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-xs)]"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          aria-hidden="true"
        />
      )}
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[15px] ${
          active
            ? 'text-[var(--accent)] font-semibold'
            : 'text-[var(--ink-muted)] font-medium hover:text-[var(--ink)]'
        }`}
      >
        {/* El icono se levanta un poco al pasar el ratón. Antes giraba -14° y
            crecía un 35 %: se sentía juguete, no producto. */}
        <motion.span
          variants={{ hovered: { y: -2, scale: 1.08 } }}
          transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          className="shrink-0"
        >
          <Icon
            className={`w-[22px] h-[22px] ${
              active ? 'text-[var(--accent)]' : 'text-[var(--ink-subtle)]'
            }`}
          />
        </motion.span>
        <span className="truncate">{item.label}</span>
        {showBadge && <SharingBadge />}
      </Link>
    </motion.div>
  );
}

interface Props {
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}

/**
 * Navegación de ESCRITORIO (barra lateral) + la cabecera fina del móvil.
 *
 * En móvil ya no hay hamburguesa ni cajón: las secciones viven en la barra de
 * pestañas de abajo (`BottomNav`), que es donde llega el pulgar. Aquí arriba
 * solo queda la marca y el buscador — que hasta ahora únicamente se abría con
 * ⌘K, o sea que en un teléfono no se podía abrir de ninguna manera.
 */
export default function Navbar({ user }: Props) {
  const pathname = usePathname();
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <>
      {/* ─── Escritorio: barra lateral ──────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[264px] shrink-0 h-screen sticky top-0 bg-[var(--surface)] border-r border-[var(--line)] z-40 overflow-y-auto">
        <div className="flex items-center gap-3 px-5 pt-7 pb-5">
          <Image
            src="/logo-fy.png"
            alt=""
            width={40}
            height={40}
            className="object-contain"
            priority
          />
          <span className="text-2xl font-extrabold tracking-tight text-[var(--ink)]">Foody</span>
        </div>

        {/* Buscador: la paleta de comandos existía desde siempre pero solo
            respondía a ⌘K, así que era invisible para quien no lo supiera. */}
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-[var(--surface-2)] text-[var(--ink-subtle)] text-sm hover:bg-[var(--surface-3)]"
          >
            <MagnifyingGlassIcon className="w-[18px] h-[18px] shrink-0" />
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--line)]">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="flex flex-col gap-5 px-3 flex-1 pt-3 pb-4">
          <LayoutGroup id="nav-desktop">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <p className="t-label px-3 pb-1.5 select-none">{section.label}</p>
                {section.items.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    showBadge={item.href === '/sharing'}
                  />
                ))}
              </div>
            ))}
          </LayoutGroup>
        </nav>

        <div className="px-3 pb-6 pt-4 border-t border-[var(--line)]">
          <div className="flex items-center gap-2.5">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name ?? user.email}
                width={38}
                height={38}
                className="rounded-full shrink-0"
              />
            ) : (
              <div className="w-[38px] h-[38px] rounded-full bg-brand-500 text-white grid place-items-center text-sm font-bold shrink-0">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)] truncate">
                {user.name ?? user.email}
              </p>
              <p className="t-meta truncate">{user.email}</p>
            </div>
            <ThemeToggle />
            <form action="/api/auth/logout" method="POST" className="shrink-0">
              <motion.button
                type="submit"
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="grid place-items-center w-9 h-9 rounded-full text-[var(--ink-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <ArrowLeftStartOnRectangleIcon className="w-5 h-5" />
              </motion.button>
            </form>
          </div>
        </div>
      </aside>

      {/* ─── Móvil: cabecera fina ───────────────────────────────────────────
          56 px y de cristal. Antes eran 64 px opacos con logo, tema y
          hamburguesa; el tema y la sesión se mudaron a la hoja «Más» y la
          hamburguesa desapareció con el cajón. */}
      <header
        className="md:hidden sticky top-0 z-40 glass border-b border-[var(--line)]"
        style={{ paddingTop: 'var(--safe-t)' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 h-14">
          <Link href="/home" className="flex items-center gap-2 touch-auto-size">
            <Image
              src="/logo-fy.png"
              alt=""
              width={30}
              height={30}
              className="object-contain"
              priority
            />
            <span className="text-lg font-extrabold tracking-tight text-[var(--ink)]">Foody</span>
          </Link>

          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Buscar"
            className="grid place-items-center w-10 h-10 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] touch-auto-size"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </button>
        </div>
      </header>
    </>
  );
}
