'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import { CATEGORY_EMOJI } from '@/lib/categories';
import type { GroceryInsight } from '@/lib/grocery-insights';
import CategoryDetailSheet from './CategoryDetailSheet';
import { fmtMoneyFine } from './finance-ui';

/**
 * En qué se fue el super del mes, por categoría.
 *
 * Esto vivía dentro de la tarjeta del Plan financiero, que no es su sitio: el
 * plan responde «cuánto me queda para mis metas», y el desglose responde «en
 * qué se me fue» — que es una pregunta de Estadísticas.
 *
 * `unitemized` va en la MISMA lista y al final: es la parte del mes que ningún
 * producto explica —tickets guardados solo con su total— y sin ella el desglose
 * enseñaba $49.90 de un mes de $176.94 sin avisar de que faltaban $127.
 */

function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI[name.toLowerCase()] ?? '🛒';
}

interface Props {
  readonly groceries: GroceryInsight;
  /** Se tocó algo dentro de una categoría: los totales de arriba cambiaron. */
  readonly onChanged: () => void;
  /** Cuántas categorías antes de la fila de «Sin detallar». */
  readonly limit?: number;
}

export default function GroceryCategoryBreakdown({ groceries: g, onChanged, limit = 6 }: Props) {
  /** Categoría abierta en la hoja de detalle. null = ninguna. */
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const filas = [...g.categories.slice(0, limit), ...(g.unitemized ? [g.unitemized] : [])];
  if (filas.length === 0) return null;

  return (
    <>
      <ul className="space-y-1.5">
        {filas.map((c) => (
          <li key={c.category}>
            {/* Cada fila abre lo que hay dentro. El chevron es toda la
                instrucción que necesita: se toca y se ve. */}
            <button
              type="button"
              onClick={() => { haptic(); setOpenCategory(c.category); }}
              className="flex w-full items-center gap-2.5 rounded-xl -mx-1.5 px-1.5 py-1.5 text-left transition active:scale-[0.99] active:bg-slate-50 dark:active:bg-white/5"
            >
              <span className="text-base shrink-0" aria-hidden="true">
                {c === g.unitemized ? '🧾' : categoryEmoji(c.category)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  {/* Las categorías ya vienen con su capitalización correcta
                      ("Condimentos y Salsas"): `capitalize` las estropearía. */}
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                    {c.category}
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                    {fmtMoneyFine(c.currentMonth)}
                    {c.deltaPct !== null && Math.abs(c.deltaPct) >= 10 && (
                      <span className={`ml-1.5 font-bold ${c.deltaPct > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-sky-700 dark:text-sky-300'}`}>
                        {c.deltaPct > 0 ? '+' : ''}{Math.round(c.deltaPct)}%
                      </span>
                    )}
                  </span>
                </span>
                {/* El resto necesita explicarse: si no, parece una categoría más
                    y el usuario se pregunta qué compró. En la misma línea que el
                    nombre se cortaba en «ticket…», que no explica nada. */}
                {c === g.unitemized && (
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    tickets sin productos
                  </span>
                )}
                <span className="block h-1.5 rounded-full bg-slate-100 dark:bg-white/10 mt-1 overflow-hidden">
                  <motion.span
                    className={`block h-full rounded-full bg-linear-to-r ${
                      c === g.unitemized ? 'from-slate-300 to-slate-400' : 'from-sky-300 to-blue-300'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${c.share}%` }}
                    transition={{ duration: 0.7 }}
                  />
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-slate-300 text-sm">›</span>
            </button>
          </li>
        ))}
      </ul>

      {openCategory !== null && (
        <CategoryDetailSheet
          category={openCategory}
          onClose={() => setOpenCategory(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
