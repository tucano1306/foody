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
 * Styled replacement for the native window.confirm(). Controlled via `open`.
 * Use for destructive actions (delete, leave) so the confirmation matches the
 * rest of the app instead of a jarring browser dialog.
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
  const confirmCls = destructive
    ? 'bg-blue-600 hover:bg-blue-700'
    : 'bg-brand-600 hover:bg-brand-700';

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
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
            onClick={onCancel}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
          >
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            {message && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{message}</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={`flex-1 py-3 rounded-2xl text-white font-bold text-sm transition disabled:opacity-50 ${confirmCls}`}
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
