'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/24/solid';

interface Action {
  readonly label: string;
  readonly emoji?: string;
  readonly onClick: () => void;
  readonly destructive?: boolean;
  /** Marca la acción como el estado actual del objeto (se ve palomeada). */
  readonly current?: boolean;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly actions: readonly Action[];
}

/**
 * Hoja de acciones.
 *
 * Filas de 60 px con el icono en su propio recuadro: se aciertan sin apuntar y
 * se reconocen sin leer. Antes eran filas de 44 px con el emoji suelto pegado
 * al texto, y en una lista de seis opciones costaba distinguir dónde acababa
 * una y empezaba la siguiente.
 *
 * El estado actual ya no se anuncia con un «✓ actual» en texto gris a la
 * derecha: se palomea, que es lo que hace cualquier selector del sistema.
 */
export default function ActionSheet({ open, onClose, title, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none">
        {/* Hoja arrastrable: bajarla con el dedo la cierra, como espera
            cualquier app móvil. El asa lo dice sin una sola palabra. */}
        <motion.section
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 110 || info.velocity.y > 500) onClose();
          }}
          className="pointer-events-auto w-full sm:max-w-sm bg-[var(--surface)] rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)] p-3 shadow-[var(--shadow-lg)] animate-fade-up touch-pan-y"
          style={{ paddingBottom: 'calc(0.75rem + var(--safe-b))' }}
        >
          <div
            className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-[var(--line-strong)]"
            aria-hidden="true"
          />
          {title && (
            <p className="px-2 pb-3 text-center font-semibold text-[var(--ink)] truncate">
              {title}
            </p>
          )}

          <div className="flex flex-col gap-1">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
                aria-current={a.current ? 'true' : undefined}
                className={`w-full flex items-center gap-3 px-2.5 min-h-[60px] rounded-2xl text-left font-semibold ${
                  a.current
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--ink)] active:bg-[var(--surface-2)]'
                }`}
              >
                {a.emoji && (
                  <span
                    aria-hidden="true"
                    className={`grid place-items-center w-11 h-11 shrink-0 rounded-xl text-xl leading-none ${
                      a.current ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    {a.emoji}
                  </span>
                )}
                <span className={`flex-1 truncate ${a.destructive ? 'text-brand-600' : ''}`}>
                  {a.label}
                </span>
                {a.current && <CheckIcon className="w-5 h-5 shrink-0" />}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full min-h-[52px] rounded-2xl bg-[var(--surface-2)] text-[var(--ink-muted)] font-semibold"
          >
            Cancelar
          </button>
        </motion.section>
      </div>
    </dialog>
  );
}
