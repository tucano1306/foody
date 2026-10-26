'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { FlagIcon } from '@heroicons/react/24/solid';
import type { CaminoDeudas } from '@/lib/camino-deudas';
import { fmtDateKey, fmtMoney, fmtMoneyShort } from './debt-ui';

interface Props {
  readonly camino: CaminoDeudas;
  readonly totalBalance: number;
  readonly interesMes: number;
  readonly cuotasMes: number;
  readonly libre: string | null;
  readonly currency: string;
  readonly onAbrir: (id: string) => void;
}

/**
 * El camino a quedar libre: cuánto se debe, cuánto se ha avanzado y cuándo
 * cae cada deuda.
 *
 * Era una tarjeta de degradado con el total, dos cifras y «🏁 Sin deudas en
 * mar 2028». Decía dónde acaba el camino pero no cuánto se ha andado ni en qué
 * orden se van cayendo las deudas, que es lo que se quiere ver al abrir esta
 * pantalla. La barra de avance y la escalera de barras de abajo lo dicen sin
 * texto: la más corta es la próxima en desaparecer, y la más larga marca la
 * fecha de «libre».
 */
export default function CaminoLibre({
  camino,
  totalBalance,
  interesMes,
  cuotasMes,
  libre,
  currency,
  onAbrir,
}: Props) {
  const reducir = useReducedMotion();
  const muelle = (i = 0) =>
    reducir ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 22, delay: i * 0.05 };

  return (
    <section aria-label="Camino a quedar libre de deudas" className="card overflow-hidden" style={{ backgroundImage: 'var(--aurora-soft)' }}>
      <div className="p-4 sm:p-5">
        <p className="t-label">Debes en total</p>
        <p className="mt-0.5 font-[family-name:var(--font-display)] t-num text-[2.4rem] leading-tight tracking-tight text-aurora">
          {fmtMoneyShort(totalBalance, currency)}
        </p>

        {camino.referencia > 0 && (
          <div className="mt-3">
            <div
              role="img"
              aria-label={`Capital pagado: ${Math.round(camino.porcentaje)} %`}
              className="h-3 rounded-full bg-[var(--surface-3)] overflow-hidden"
            >
              <motion.span
                className="block h-full rounded-full"
                style={{ backgroundImage: 'var(--aurora)' }}
                initial={reducir ? false : { width: 0 }}
                animate={{ width: `${camino.porcentaje}%` }}
                transition={muelle()}
              />
            </div>
            <p className="mt-1.5 t-meta">
              <span className="font-bold text-[var(--ink)]">{Math.round(camino.porcentaje)} %</span> del capital pagado ·{' '}
              {fmtMoneyShort(camino.pagado, currency)} de {fmtMoneyShort(camino.referencia, currency)}
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 px-3 py-2.5">
            <p className="t-label">Interés cada mes</p>
            <p className="t-num text-[17px] text-[var(--ink)]">{fmtMoney(interesMes, currency, 0)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/80 px-3 py-2.5">
            <p className="t-label">Cuotas al mes</p>
            <p className="t-num text-[17px] text-[var(--ink)]">{fmtMoney(cuotasMes, currency, 0)}</p>
          </div>
        </div>
      </div>

      {/* Con una sola deuda la escalera sería una barra suelta que repite lo
          que ya dice su tarjeta: basta la fecha. */}
      {camino.filas.length < 2 && libre && (
        <p className="border-t border-[var(--line)] bg-[var(--surface)]/60 px-4 py-3 sm:px-5 flex items-center gap-1.5 text-[13px] font-bold text-[var(--accent)]">
          <FlagIcon aria-hidden="true" className="w-4 h-4" />
          Libre en {fmtDateKey(libre)}
        </p>
      )}

      {camino.filas.length >= 2 && (
        <div className="border-t border-[var(--line)] bg-[var(--surface)]/60 px-4 py-3 sm:px-5">
          <p className="flex items-center justify-between gap-2 mb-2">
            <span className="t-label">Cuándo termina cada una</span>
            {libre && (
              <span className="flex items-center gap-1 text-[13px] font-bold text-[var(--accent)]">
                <FlagIcon aria-hidden="true" className="w-4 h-4" />
                Libre en {fmtDateKey(libre)}
              </span>
            )}
          </p>
          <ul className="space-y-1">
            {camino.filas.map((f, i) => (
              <li key={f.clave}>
                <button
                  type="button"
                  onClick={() => onAbrir(f.abrir)}
                  className="w-full rounded-xl px-2 py-2 text-left transition hover:bg-[var(--surface-2)] active:scale-[0.99]"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-[var(--ink)]">{f.nombre}</span>
                    <span className="shrink-0 t-num text-[13px] text-[var(--ink-muted)]">
                      {f.atascada ? 'no termina' : fmtDateKey(f.fin)}
                    </span>
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="relative flex-1 h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                      {f.atascada ? (
                        // Con la cuota de ahora el saldo no baja nunca: la barra
                        // llega hasta el final y rayada, sin fecha a la que llegar.
                        <span className="absolute inset-0 bg-[repeating-linear-gradient(45deg,var(--color-blue-400)_0_4px,transparent_4px_8px)]" />
                      ) : (
                        <motion.span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ backgroundImage: 'var(--aurora)' }}
                          initial={reducir ? false : { width: 0 }}
                          animate={{ width: `${Math.max(4, ((f.meses ?? 0) / Math.max(1, camino.mesesMax)) * 100)}%` }}
                          transition={muelle(i)}
                        />
                      )}
                    </span>
                    <span className="shrink-0 w-16 text-right t-num text-[11px] text-[var(--ink-subtle)]">
                      {fmtMoneyShort(f.saldo, currency)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
