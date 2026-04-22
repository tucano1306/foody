'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastCtx {
  readonly show: (message: string, tone?: Toast['tone']) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const TONE_CLASSES: Record<Toast['tone'], string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  info: 'bg-white border-stone-200 text-stone-800',
};

function dropToast(id: number) {
  return (prev: Toast[]) => prev.filter((t) => t.id !== id);
}

export function ToastProvider({ children }: { readonly children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts(dropToast(id)), 2800);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <output
            key={t.id}
            className={
              'pointer-events-auto rounded-xl px-4 py-2.5 shadow-lg animate-fade-up text-sm font-medium border ' +
              TONE_CLASSES[t.tone]
            }
          >
            {t.message}
          </output>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { show: () => undefined };
  }
  return ctx;
}
