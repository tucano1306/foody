'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/solid';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastCtx {
  readonly show: (message: string, tone?: Toast['tone']) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

/**
 * El icono es lo que distingue un aviso de otro, no el color.
 *
 * Antes el toast de ERROR era `bg-blue-50 border-blue-200` y el de ÉXITO
 * `bg-sky-50 border-sky-200`: dos azules pálidos que en un móvil a plena luz
 * son el mismo. Un error que se ve igual que un acierto no avisa de nada. Como
 * la app va en una sola gama azul a propósito, la diferencia la lleva la forma
 * —palomita, admiración, i— que además funciona para quien no distingue
 * colores.
 */
const TONE_ICON = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  info: InformationCircleIcon,
} as const;

const TONE_COLOR = {
  success: 'text-brand-300',
  error: 'text-white',
  info: 'text-brand-300',
} as const;

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
      {/*
        Abajo y no arriba: el aviso confirma algo que se acaba de tocar, y lo
        que se acaba de tocar está donde está el pulgar. Arriba obligaba a
        cruzar la pantalla con la vista para leer «Guardado». Se coloca por
        encima de la barra de pestañas para no taparla.
      */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ bottom: 'calc(var(--tabbar-h) + 0.75rem)' }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = TONE_ICON[t.tone];
            return (
              <motion.output
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-auto flex items-center gap-2.5 max-w-sm rounded-full bg-[#0b1220] dark:bg-[#1b2740] pl-3 pr-4 py-3 shadow-[var(--shadow-lg)]"
              >
                <Icon className={`w-5 h-5 shrink-0 ${TONE_COLOR[t.tone]}`} />
                <span className="text-sm font-semibold text-white">{t.message}</span>
              </motion.output>
            );
          })}
        </AnimatePresence>
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
