'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDownRightIcon, ArrowUpRightIcon, EqualsIcon } from '@heroicons/react/24/solid';
import type { RitmoCompras as Ritmo } from '@/lib/ritmo-compras';

interface Props {
  readonly ritmo: Ritmo;
  readonly formato: (n: number) => string;
  /** Tocar una barra abre ese mes en la lista de abajo. */
  readonly onElegirMes: (key: string) => void;
}

/** Por debajo de esto, «más» o «menos» es ruido de redondeo. */
const UMBRAL = 1;

/**
 * El mes en el súper, contra tu costumbre.
 *
 * La cifra grande es lo gastado este mes; la frase de debajo la pone en
 * contexto con lo que SOLÍAS llevar gastado al llegar a este mismo día —no con
 * un mes entero, que el día 10 siempre haría parecer barato el mes en curso—.
 * Las barras enseñan la tendencia de un vistazo, con la media marcada, y cada
 * una abre su mes.
 */
export default function RitmoCompras({ ritmo, formato, onElegirMes }: Props) {
  const reducir = useReducedMotion();
  const { actual, habitualHastaHoy, mediaMensual, barras, comprasActual } = ritmo;
  const tope = Math.max(...barras.map((b) => b.total), mediaMensual ?? 0, 1);

  let comparacion: { texto: string; Icono: typeof EqualsIcon } | null = null;
  if (habitualHastaHoy !== null) {
    const diferencia = actual - habitualHastaHoy;
    if (Math.abs(diferencia) < UMBRAL) {
      comparacion = { texto: 'Igual que de costumbre a estas alturas', Icono: EqualsIcon };
    } else if (diferencia < 0) {
      comparacion = { texto: `${formato(-diferencia)} menos que de costumbre a estas alturas`, Icono: ArrowDownRightIcon };
    } else {
      comparacion = { texto: `${formato(diferencia)} más que de costumbre a estas alturas`, Icono: ArrowUpRightIcon };
    }
  }

  return (
    <section
      aria-label="Este mes en el súper"
      className="card p-4 sm:p-5"
      style={{ backgroundImage: 'var(--aurora-soft)' }}
    >
      <p className="t-label">Este mes en el súper</p>
      <p className="mt-0.5 font-[family-name:var(--font-display)] t-num text-[2.4rem] leading-tight tracking-tight text-aurora">
        {formato(actual)}
      </p>
      <p className="t-meta">
        {comprasActual === 0
          ? 'Sin compras todavía'
          : `${comprasActual} ${comprasActual === 1 ? 'compra' : 'compras'}`}
      </p>

      {comparacion && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)]/80 border border-[var(--line)] px-3 py-1.5 text-[13px] font-semibold text-[var(--ink)]">
          <comparacion.Icono aria-hidden="true" className="w-4 h-4 text-[var(--accent)]" />
          {comparacion.texto}
        </p>
      )}

      {barras.length >= 2 && (
        <div className="mt-4 pt-5">
          <div className="relative h-28 flex items-end gap-2">
            {/* La media de un mes entero, como raya de referencia: lo que
                sobresale de ella salta a la vista sin leer cifras. */}
            {mediaMensual !== null && mediaMensual > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-[var(--line-strong)] pointer-events-none"
                style={{ bottom: `${(mediaMensual / tope) * 100}%` }}
              >
                <span className="absolute left-0 -top-[18px] rounded-md bg-[var(--surface)]/80 px-1 t-meta text-[11px]">media</span>
              </span>
            )}
            {barras.map((b, i) => (
              <button
                key={b.key}
                type="button"
                onClick={() => onElegirMes(b.key)}
                aria-label={`${b.etiqueta}: ${formato(b.total)}`}
                className="group relative flex-1 h-full flex flex-col justify-end items-center focus:outline-none touch-auto-size"
              >
                <motion.span
                  initial={reducir ? false : { height: 0 }}
                  animate={{ height: `${Math.max((b.total / tope) * 100, b.total > 0 ? 4 : 1.5)}%` }}
                  transition={reducir ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 24, delay: i * 0.04 }}
                  className={`relative w-full max-w-11 rounded-t-xl rounded-b-md transition-[filter] group-hover:brightness-110 group-active:brightness-95 ${
                    b.actual ? 'shadow-[var(--glow)]' : 'bg-brand-200 dark:bg-brand-900'
                  }`}
                  style={b.actual ? { backgroundImage: 'var(--aurora)' } : undefined}
                >
                  {/* La cifra del mes en curso, encima de su barra: es la
                      única que se lee; las demás están a un toque. */}
                  {b.actual && b.total > 0 && (
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 t-num text-[11px] text-[var(--ink)] whitespace-nowrap">
                      {formato(b.total)}
                    </span>
                  )}
                </motion.span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {barras.map((b) => (
              <span
                key={b.key}
                className={`flex-1 text-center text-[11px] ${b.actual ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-subtle)]'}`}
              >
                {b.etiqueta}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
