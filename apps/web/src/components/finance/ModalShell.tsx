'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/solid';

interface Props {
  readonly title: string;
  readonly subtitle?: string;
  readonly emoji?: string;
  /** Degradado pastel del encabezado. */
  readonly headerClass?: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
}

/**
 * Concha común de los modales de finanzas: hoja inferior en móvil, tarjeta
 * centrada en escritorio, encabezado pastel fijo y pie con las acciones.
 * Cierra con Escape y bloquea el scroll del fondo mientras está abierta.
 */
export default function ModalShell({
  title,
  subtitle,
  emoji,
  headerClass = 'from-sky-100 to-indigo-100 dark:from-sky-500/20 dark:to-indigo-500/10',
  onClose,
  children,
  footer,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <motion.button
        type="button"
        aria-label="Cerrar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-navy-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className={`shrink-0 bg-linear-to-br ${headerClass} px-5 pt-5 pb-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                {emoji && <span aria-hidden="true">{emoji}</span>}
                <span className="truncate">{title}</span>
              </h2>
              {subtitle && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 p-1.5 rounded-full bg-white/70 dark:bg-white/10 text-slate-500 dark:text-slate-300 hover:bg-white transition"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-slate-100 dark:border-white/10 px-5 py-4 bg-white/80 dark:bg-navy-800/80 backdrop-blur">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}
