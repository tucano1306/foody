'use client';

import { useEffect, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { lockBodyScroll } from '@/lib/scroll-lock';
import ModalLayer from '@/components/ui/ModalLayer';

interface Props {
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly emoji?: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly pie?: React.ReactNode;
}

/**
 * Hoja inferior de Tiendas y del selector de tienda del Súper.
 *
 * La misma mecánica que `ModalShell` de finanzas —se arrastra hacia abajo para
 * cerrar, Escape, bloqueo del scroll del fondo contado, colgada del `body`—
 * pero con los colores de la app (`--surface`, `--ink`) y su modo oscuro: el
 * Súper se usa de noche en el parqueo, y la hoja de finanzas es pastel fijo.
 *
 * Va dentro de un `AnimatePresence` del que la llama; la raíz es un motion
 * component por la misma razón que en ModalShell: si no, al cerrar se queda
 * montada e invisible tapando los toques.
 */
export default function Hoja({ titulo, subtitulo, emoji, onClose, children, pie }: Props) {
  const arrastre = useDragControls();
  // Quien la abre suele pasar una flecha nueva en cada render; con la
  // referencia, el bloqueo del scroll se pone una vez y no en cada pintado.
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
    };
    document.addEventListener('keydown', alPulsar);
    const soltar = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', alPulsar);
      soltar();
    };
  }, []);

  return (
    <ModalLayer>
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
          className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          initial={{ y: 60, scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          dragListener={false}
          dragControls={arrastre}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 500) onClose();
          }}
          className="relative w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-[var(--surface)] text-[var(--ink)] rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)] shadow-2xl overflow-hidden"
        >
          <div className="shrink-0 px-5 pt-4 pb-3 touch-none" onPointerDown={(e) => arrastre.start(e)}>
            <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--line)]" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold flex items-center gap-2">
                  {emoji && <span aria-hidden="true">{emoji}</span>}
                  <span className="truncate">{titulo}</span>
                </h2>
                {subtitulo && <p className="t-meta mt-0.5 truncate">{subtitulo}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 w-9 h-9 grid place-items-center rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] transition active:scale-90"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

          {pie && (
            <div className="shrink-0 border-t border-[var(--line)] px-5 py-4 pb-[calc(1rem+var(--safe-b,0px))]">{pie}</div>
          )}
        </motion.div>
      </motion.div>
    </ModalLayer>
  );
}
