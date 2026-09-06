'use client';

import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  readonly open: boolean;
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Sustituto con estilo del window.confirm() nativo. Se controla con `open`.
 * Para acciones destructivas (borrar, salir), para que la confirmación se
 * parezca al resto de la app en vez de a un diálogo del navegador.
 *
 * El botón de confirmar va SEGUNDO y con más peso; el de cancelar, primero y
 * en hueco. En una hoja que sale de abajo, el pulgar cae sobre la derecha, y
 * ahí es donde tiene que estar la acción que se buscaba.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <motion.button
            type="button"
            aria-label="Cancelar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px] cursor-default"
            onClick={onCancel}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="relative w-full sm:max-w-sm bg-[var(--surface)] rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)] shadow-[var(--shadow-lg)] p-6"
            style={{ paddingBottom: 'calc(1.5rem + var(--safe-b))' }}
          >
            <h2 className="text-xl font-extrabold text-[var(--ink)]">{title}</h2>
            {message && (
              <p className="mt-2 text-[15px] leading-snug text-[var(--ink-muted)]">{message}</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 min-h-[52px] rounded-2xl bg-[var(--surface-2)] text-[var(--ink-muted)] font-semibold disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={`flex-1 min-h-[52px] rounded-2xl font-bold text-white disabled:opacity-50 ${
                  destructive ? 'bg-brand-700 hover:bg-brand-800' : 'btn-primary'
                }`}
              >
                {busy ? 'Procesando…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
