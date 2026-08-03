'use client';

import { useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
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
  headerClass = 'from-sky-100 to-blue-100',
  onClose,
  children,
  footer,
}: Props) {
  const dragControls = useDragControls();

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
    // La raíz DEBE ser un motion component: es el hijo que AnimatePresence
    // rastrea para saber cuándo puede desmontar. Con un <div> normal aquí, al
    // cerrar el modal quedaba montado e invisible, con el fondo bloqueado
    // (overflow:hidden) y el overlay capturando los clics — la app parecía
    // congelada justo después de guardar una meta.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      {/* Bottom sheet: se arrastra hacia abajo para cerrar, como espera
          cualquier app móvil. El arrastre solo agarra de la cabecera para no
          pelearse con el scroll del contenido. */}
      <motion.div
        initial={{ y: 60, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        dragListener={false}
        dragControls={dragControls}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 500) onClose();
        }}
        className="relative w-full sm:max-w-lg max-h-[92vh] flex flex-col bg-sky-50 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div
          className={`shrink-0 bg-linear-to-br ${headerClass} px-5 pt-5 pb-4 touch-none`}
          onPointerDown={(e) => dragControls.start(e)}
        >
          {/* Asa: dice "arrástrame" sin una sola palabra. */}
          <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-400/40" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-black flex items-center gap-2">
                {emoji && <span aria-hidden="true">{emoji}</span>}
                <span className="truncate">{title}</span>
              </h2>
              {subtitle && <p className="text-xs text-slate-600 mt-1">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 p-1.5 rounded-full bg-white/70 text-slate-500 hover:bg-white transition"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-sky-100 px-5 py-4 bg-sky-50 backdrop-blur">
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
