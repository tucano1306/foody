'use client';

import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="w-9 h-9 flex items-center justify-center rounded-full text-lg bg-white/70 dark:bg-white/10 shadow-sm hover:bg-white dark:hover:bg-white/20 transition"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
