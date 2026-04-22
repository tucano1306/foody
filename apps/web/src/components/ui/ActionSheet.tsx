'use client';

import { useEffect, useRef } from 'react';

interface Action {
  readonly label: string;
  readonly emoji?: string;
  readonly onClick: () => void;
  readonly destructive?: boolean;
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
        <section className="pointer-events-auto w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl animate-fade-up">
          {title && (
            <p className="text-center text-sm font-semibold text-stone-500 pb-3 border-b border-stone-100 truncate">
              {title}
            </p>
          )}
          <div className="flex flex-col gap-1 pt-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.onClick();
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left font-medium transition-colors ${
                  a.destructive
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                {a.emoji && <span className="text-xl">{a.emoji}</span>}
                {a.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 font-semibold transition"
          >
            Cancelar
          </button>
        </section>
      </div>
    </dialog>
  );
}
