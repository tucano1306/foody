'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Action {
  readonly label: string;
  readonly emoji?: string;
  readonly onClick: () => void;
  readonly destructive?: boolean;
  /** Marks the action as the product's current state (shows a check + "actual"). */
  readonly current?: boolean;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly actions: readonly Action[];
}

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
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none">
        {/* Bottom sheet arrastrable: bajarla con el dedo la cierra, como
            espera cualquier app móvil. El asa lo dice sin una sola palabra. */}
        <motion.section
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 110 || info.velocity.y > 500) onClose();
          }}
          className="pointer-events-auto w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl animate-fade-up touch-pan-y"
        >
          <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          {title && (
            <p className="text-center text-sm font-semibold text-slate-500 pb-3 border-b border-slate-100 truncate">
              {title}
            </p>
          )}
          <div className="flex flex-col gap-1 pt-2">
            {actions.map((a) => {
              let btnCls = 'text-slate-700 hover:bg-slate-100';
              if (a.current) btnCls = 'bg-slate-100 text-slate-500';
              else if (a.destructive) btnCls = 'text-blue-600 hover:bg-blue-50';
              return (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left font-medium transition-colors ${btnCls}`}
              >
                {a.emoji && <span className="text-xl">{a.emoji}</span>}
                <span className="flex-1">{a.label}</span>
                {a.current && (
                  <span className="text-xs font-semibold text-slate-400">✓ actual</span>
                )}
              </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold transition"
          >
            Cancelar
          </button>
        </motion.section>
      </div>
    </dialog>
  );
}
