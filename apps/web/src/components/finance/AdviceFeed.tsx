'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import type { Advice, AdviceAction } from '@/lib/finance-engine';
import ModalShell from './ModalShell';
import { BTN_PRIMARY, CARD, LABEL, NUM, TONE_TILE } from './finance-ui';

interface Props {
  readonly advice: readonly Advice[];
  readonly onAction: (action: AdviceAction) => void;
}

/**
 * Cuántos se ven sin tocar nada.
 *
 * El consejero llegó a enseñar ocho tarjetas con un párrafo cada una, y lo que
 * importaba —un pago atrasado, el fin de un 0 %— quedaba entre avisos del
 * super. Vienen ordenados por gravedad, así que los primeros son los que hay
 * que leer; el resto espera detrás de «Ver más».
 */
const A_LA_VISTA = 3;

/**
 * Una fila: qué pasa, con su cifra, y debajo el porqué en una frase. La fila
 * entera abre el detalle; el chevrón lo dice sin palabras.
 */
function AdviceRow({ item, onOpen }: { readonly item: Advice; readonly onOpen: () => void }) {
  return (
    // El separador va en cada fila y no con `divide-*`: `border-sky-100` tiene
    // su línea oscura en globals.css y `divide-sky-100` no, y en oscuro dejaba
    // rayas claras entre consejo y consejo.
    <li className="border-b border-sky-100 last:border-b-0">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          haptic(8);
          onOpen();
        }}
        className="flex w-full items-center gap-3 py-3 text-left transition active:scale-[0.99]"
      >
        <span
          aria-hidden="true"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xl ${TONE_TILE[item.tone]}`}
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] font-black leading-snug ${NUM}`}>
            {/* Leído suelto, «Viaje no llega a tiempo» no dice que es una meta:
                antes lo decía un título de grupo, que ocupaba una fila entera. */}
            {item.topic === 'goals' && <span className={`font-bold ${LABEL}`}>Meta · </span>}
            {item.title}
          </span>
          <span className={`mt-0.5 block text-[13px] leading-snug line-clamp-2 ${LABEL}`}>{item.body}</span>
        </span>
        <ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
    </li>
  );
}

/**
 * El detalle: la frase, las cifras con su nombre, qué se puede hacer y el botón
 * que lo resuelve.
 *
 * Las cifras iban dentro del párrafo —cinco importes en una frase— y no había
 * forma de saber cuál era cuál. En columna, cada una dice qué es.
 */
function AdviceSheet({
  item,
  onClose,
  onAction,
}: {
  readonly item: Advice;
  readonly onClose: () => void;
  readonly onAction: (action: AdviceAction) => void;
}) {
  const action = item.action;
  return (
    <ModalShell
      title={item.title}
      wrapTitle
      emoji={item.icon}
      onClose={onClose}
      footer={
        action ? (
          <button
            type="button"
            onClick={() => {
              haptic(10);
              // Primero se cierra: la acción suele abrir otra hoja (la meta,
              // el aporte) y dos a la vista se taparían.
              onClose();
              onAction(action);
            }}
            className={`w-full rounded-2xl py-3 text-sm font-black shadow-sm transition ${BTN_PRIMARY}`}
          >
            {action.label}
          </button>
        ) : undefined
      }
    >
      <p className="font-reading text-[16px] leading-relaxed text-slate-800">{item.body}</p>

      {item.figures && item.figures.length > 0 && (
        <dl className="mt-4 overflow-hidden rounded-2xl bg-white">
          {item.figures.map((f) => (
            <div
              key={f.label}
              className="flex items-baseline justify-between gap-4 border-b border-sky-100 px-4 py-3 last:border-b-0"
            >
              <dt className={`min-w-0 text-sm ${LABEL}`}>{f.label}</dt>
              <dd className={`shrink-0 text-right text-sm font-black tabular-nums ${NUM}`}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {item.steps && item.steps.length > 0 && (
        <ul className="mt-4 space-y-2">
          {item.steps.map((step) => (
            <li key={step} className="flex gap-2 font-reading text-[15px] leading-relaxed text-slate-700">
              <span aria-hidden="true" className="shrink-0 text-slate-400">·</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

/**
 * El consejero: una lista corta, de lo más urgente a lo que va bien.
 *
 * Eran tarjetas grandes con un párrafo cada una, en dos grupos con título, y
 * entre todas repetían cifras que el Plan ya enseña arriba. Ahora cada consejo
 * es una línea con su cifra, y lo demás —el desglose, las opciones, el botón—
 * vive en la hoja que se abre al tocarlo.
 */
export default function AdviceFeed({ advice, onAction }: Props) {
  // El id y no el consejo: al recalcularse el plan (volver a la app, deslizar
  // para recargar) la hoja enseña las cifras nuevas, y si el consejo ya no
  // existe —se resolvió— se cierra sola.
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);

  if (advice.length === 0) return null;

  const abierto = advice.find((a) => a.id === abiertoId) ?? null;
  const visibles = todos ? advice : advice.slice(0, A_LA_VISTA);
  const ocultos = advice.length - A_LA_VISTA;

  return (
    <section className={`rounded-3xl p-5 shadow-sm ${CARD}`}>
      <h2 className={`text-sm font-black ${NUM}`}>🧠 Tu consejero</h2>

      <ul className="mt-1">
        {visibles.map((item) => (
          <AdviceRow key={item.id} item={item} onOpen={() => setAbiertoId(item.id)} />
        ))}
      </ul>

      {ocultos > 0 && (
        <button
          type="button"
          aria-expanded={todos}
          onClick={() => {
            haptic(6);
            setTodos((v) => !v);
          }}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-2xl py-2 text-xs font-bold text-slate-600 transition active:scale-[0.98]"
        >
          {todos ? 'Ver menos' : `Ver ${ocultos} más`}
          <ChevronDownIcon
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform ${todos ? 'rotate-180' : ''}`}
          />
        </button>
      )}

      <AnimatePresence>
        {abierto && (
          <AdviceSheet
            key={abierto.id}
            item={abierto}
            onClose={() => setAbiertoId(null)}
            onAction={onAction}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
