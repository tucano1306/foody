'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import { agruparPapelera, cuandoSeBorro, type DeudaEnPapelera } from '@/lib/papelera-deudas';
import ChipDeCuenta from './ChipDeCuenta';
import { fmtMoney } from './debt-ui';

interface Props {
  readonly filas: readonly DeudaEnPapelera[];
  /** La entrada que se está recuperando; mientras tanto, las demás esperan. */
  readonly recuperando: string | null;
  readonly onRecuperar: (id: string, ids: readonly string[]) => void;
}

/**
 * Lo borrado en Deudas, para recuperarlo con todo su historial.
 *
 * Existe porque borrar era para siempre: el 7 nov 2026 el dueño borró sus
 * tarjetas desde el Plan y con ellas se fueron todos sus abonos. Ahora borrar
 * manda aquí, y aquí cada cuenta se ve como se recuerda —«BofA ···3650», no
 * sus tres tramos sueltos— con lo que debía y cuándo se borró.
 *
 * Plegada por defecto: es a donde se viene a buscar algo, no algo que mirar
 * cada día. Sin nada dentro no se pinta.
 */
export default function PapeleraDeDeudas({ filas, recuperando, onRecuperar }: Props) {
  const [abierta, setAbierta] = useState(false);
  const entradas = useMemo(() => agruparPapelera(filas), [filas]);
  if (entradas.length === 0) return null;

  return (
    <section aria-label="Papelera">
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => {
          haptic();
          setAbierta((v) => !v);
        }}
        className="flex w-full items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-500 transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"
      >
        <span aria-hidden="true">🗑️</span>
        <span className="flex-1">Papelera</span>
        <span className="surface-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums">{entradas.length}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
        />
      </button>

      {abierta && (
        <ul className="surface-2 mt-1 divide-y divide-[var(--line-strong)] overflow-hidden rounded-2xl">
          {entradas.map((e) => {
            const cuando = cuandoSeBorro(e.deletedAt);
            const detalle = [
              fmtMoney(e.saldo, e.currency),
              e.tramos > 1 ? `${e.tramos} tramos` : null,
              cuando ? `borrada ${cuando}` : null,
            ].filter(Boolean);
            return (
              <li key={`${e.id}|${e.deletedAt ?? ''}`} className="flex items-center gap-3 px-3.5 py-3">
                <ChipDeCuenta ultimos={e.ultimos} kind={e.kind} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight text-[var(--ink)]">{e.titulo}</p>
                  <p className="t-meta mt-0.5">{detalle.join(' · ')}</p>
                </div>
                <button
                  type="button"
                  disabled={recuperando !== null}
                  onClick={() => {
                    haptic();
                    onRecuperar(e.id, e.ids);
                  }}
                  aria-label={`Recuperar ${e.titulo}`}
                  className="btn-soft shrink-0 px-3.5 py-2 text-xs transition active:scale-95 disabled:opacity-50"
                >
                  {recuperando === e.id ? 'Recuperando…' : 'Recuperar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
