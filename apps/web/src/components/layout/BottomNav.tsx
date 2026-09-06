'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftStartOnRectangleIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { Squares2X2Icon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import SharingBadge from '@/components/sharing/SharingBadge';
import ThemeToggle from './ThemeToggle';
import {
  OVERFLOW_SECTIONS,
  TAB_ITEMS,
  isActivePath,
  isOverflowActive,
} from './navigation';

/**
 * Barra de pestañas del móvil.
 *
 * Antes, las once secciones vivían detrás de un icono de hamburguesa: para ir
 * al súper hacían falta dos toques y saber que el menú existe. Una barra
 * inferior pone los cuatro destinos de todos los días bajo el pulgar, visibles
 * siempre, y deja claro dónde estás sin que nadie tenga que leer nada — el
 * icono relleno y el color lo dicen.
 *
 * Es la parte baja de la pantalla a propósito: es la única zona que un pulgar
 * alcanza sin recolocar el teléfono, y es donde la busca cualquiera que haya
 * usado un móvil en los últimos diez años.
 */
export default function BottomNav({
  user,
}: {
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = isOverflowActive(pathname);

  // Cerrar la hoja al navegar: sin esto se queda abierta encima de la página
  // nueva y hay que descartarla a mano.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-[var(--line)]"
        style={{ paddingBottom: 'var(--safe-b)' }}
      >
        <ul className="grid grid-cols-5 px-1">
          {TAB_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = active ? item.iconActive : item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => haptic(8)}
                  aria-current={active ? 'page' : undefined}
                  className="relative flex flex-col items-center justify-center gap-1 h-[4.25rem] rounded-2xl touch-auto-size"
                >
                  {/* Píldora que se desliza de una pestaña a otra. Un solo
                      elemento compartido vía layoutId: el indicador VIAJA en
                      vez de aparecer y desaparecer, y ese movimiento es lo que
                      hace que la barra se sienta viva. */}
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-[var(--accent-soft)]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      aria-hidden="true"
                    />
                  )}
                  <motion.span
                    className="relative"
                    animate={active ? { y: -1, scale: 1.06 } : { y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  >
                    <Icon
                      className={`w-6 h-6 ${active ? 'text-[var(--accent)]' : 'text-[var(--ink-subtle)]'}`}
                    />
                  </motion.span>
                  <span
                    className={`relative text-[11px] leading-none ${
                      active
                        ? 'font-bold text-[var(--accent)]'
                        : 'font-medium text-[var(--ink-subtle)]'
                    }`}
                  >
                    {item.shortLabel ?? item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => {
                haptic(8);
                setMoreOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="relative w-full flex flex-col items-center justify-center gap-1 h-[4.25rem] rounded-2xl touch-auto-size"
            >
              {moreActive && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-[var(--accent-soft)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden="true"
                />
              )}
              <span className="relative">
                {moreActive ? (
                  <Squares2X2Icon className="w-6 h-6 text-[var(--accent)]" />
                ) : (
                  <EllipsisHorizontalIcon className="w-6 h-6 text-[var(--ink-subtle)]" />
                )}
                {/* El punto de «te han compartido algo» tiene que verse desde
                    fuera, o la notificación queda enterrada en la hoja. */}
                <span className="absolute -top-1 -right-1.5">
                  <SharingBadge />
                </span>
              </span>
              <span
                className={`relative text-[11px] leading-none ${
                  moreActive
                    ? 'font-bold text-[var(--accent)]'
                    : 'font-medium text-[var(--ink-subtle)]'
                }`}
              >
                Más
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pathname={pathname}
        user={user}
      />
    </>
  );
}

/**
 * El resto de secciones, en una hoja que se arrastra hacia abajo para cerrar.
 *
 * Cada destino es una fila de 60 px con su icono: se acierta sin apuntar y se
 * reconoce sin leer. Los tres grupos («Tu cocina», «Finanzas», «Tu mundo») son
 * los mismos que en la barra lateral de escritorio, así que quien use las dos
 * no tiene que aprender dos mapas.
 */
function MoreSheet({
  open,
  onClose,
  pathname,
  user,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly pathname: string;
  readonly user: { name: string | null; avatarUrl: string | null; email: string };
}) {
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <motion.button
            type="button"
            aria-label="Cerrar menú"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px] cursor-default"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Más secciones"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 500) onClose();
            }}
            className="relative w-full max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-sheet)] bg-[var(--surface)] shadow-[var(--shadow-lg)] touch-pan-y"
            style={{ paddingBottom: 'calc(1.25rem + var(--safe-b))' }}
          >
            {/* El asa dice «me puedes arrastrar» sin una sola palabra. */}
            <div className="sticky top-0 pt-3 pb-2 bg-[var(--surface)] rounded-t-[var(--radius-sheet)]">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-[var(--line-strong)]" aria-hidden="true" />
            </div>

            <div className="px-4 pb-2 space-y-6">
              {OVERFLOW_SECTIONS.map((section) => (
                <div key={section.label}>
                  <p className="t-label px-1 pb-2">{section.label}</p>
                  <div className="grid gap-1">
                    {section.items.map((item) => {
                      const active = isActivePath(pathname, item.href);
                      const Icon = active ? item.iconActive : item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => haptic(8)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3.5 rounded-2xl px-3 min-h-[60px] font-semibold ${
                            active
                              ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                              : 'text-[var(--ink)] active:bg-[var(--surface-2)]'
                          }`}
                        >
                          <span
                            className={`grid place-items-center w-11 h-11 shrink-0 rounded-xl ${
                              active ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)]'
                            }`}
                          >
                            <Icon
                              className={`w-[22px] h-[22px] ${
                                active ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]'
                              }`}
                            />
                          </span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.href === '/sharing' && <SharingBadge />}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* ─── Cuenta ──────────────────────────────────────────────── */}
              <div className="pt-1 border-t border-[var(--line)]">
                <div className="flex items-center gap-3 pt-4">
                  {user.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={user.name ?? user.email}
                      width={44}
                      height={44}
                      className="rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-brand-500 text-white grid place-items-center font-bold shrink-0">
                      {initial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--ink)] truncate">
                      {user.name ?? user.email}
                    </p>
                    <p className="t-meta truncate">{user.email}</p>
                  </div>
                  <ThemeToggle />
                  <form action="/api/auth/logout" method="POST" className="shrink-0">
                    <button
                      type="submit"
                      title="Cerrar sesión"
                      aria-label="Cerrar sesión"
                      className="grid place-items-center w-11 h-11 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] touch-auto-size"
                    >
                      <ArrowLeftStartOnRectangleIcon className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
