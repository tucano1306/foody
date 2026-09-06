'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { MoonIcon, SunIcon } from '@heroicons/react/24/solid';
import { useTheme } from './ThemeProvider';

/**
 * Interruptor de tema.
 *
 * Antes eran los emojis 🌙/☀️: cambian de dibujo en cada sistema operativo, no
 * heredan el color del texto y junto a los Heroicons del resto de la interfaz
 * daban dos lenguajes de iconos a la vez. Ahora es el mismo trazo que todo lo
 * demás, y el icono gira al cambiar para que el toque tenga respuesta.
 */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="relative grid place-items-center w-9 h-9 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)] touch-auto-size"
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          className="grid place-items-center"
        >
          {isDark ? <SunIcon className="w-[18px] h-[18px]" /> : <MoonIcon className="w-[18px] h-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
