'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import ComputoSheet from './ComputoSheet';
import { useComputo, type EstadoComputo } from './useComputo';

/** Una palabra para cada estado: lo que se ve de un vistazo en Compras y Pagos. */
export function etiquetaChip(e: EstadoComputo, error: string | null): { texto: string; tono: 'ok' | 'pendiente' | 'apagado' | 'error' } {
  if (!e.activo) return { texto: 'apagado', tono: 'apagado' };
  if (error || e.ultimoError) return { texto: 'revisar', tono: 'error' };
  const pendientes = (e.pendientes?.nuevos ?? 0) + (e.pendientes?.quitar ?? 0);
  if (pendientes > 0) return { texto: `${pendientes} por enviar`, tono: 'pendiente' };
  return { texto: 'al día', tono: 'ok' };
}

const TONOS = {
  ok: 'border-sky-200 bg-sky-50 text-sky-800',
  pendiente: 'border-blue-300 bg-blue-50 text-blue-800',
  apagado: 'border-slate-200 bg-white text-slate-500',
  error: 'border-blue-400 bg-blue-100 text-blue-900',
} as const;

const ICONOS = { ok: '✓', pendiente: '↻', apagado: '↗', error: '!' } as const;

/**
 * «Computo · al día»: el enlace con la contabilidad, en una píldora.
 *
 * Solo existe para el dueño (el servidor contesta 404 a cualquier otro y el
 * chip no se pinta). Tocarlo abre la hoja con todo lo demás.
 */
export default function ComputoChip() {
  const computo = useComputo();
  const [abierta, setAbierta] = useState(false);
  if (!computo.estado) return null;

  const { texto, tono } = etiquetaChip(computo.estado, computo.error);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic();
          setAbierta(true);
        }}
        aria-label={`Computo: ${texto}`}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-95 ${TONOS[tono]}`}
      >
        <span aria-hidden="true" className={computo.ocupado ? 'animate-spin' : ''}>
          {ICONOS[tono]}
        </span>
        Computo · {texto}
      </button>
      <AnimatePresence>
        {abierta && <ComputoSheet key="computo" computo={computo} onClose={() => setAbierta(false)} />}
      </AnimatePresence>
    </>
  );
}
