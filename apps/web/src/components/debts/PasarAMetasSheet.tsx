'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import ModalShell from '@/components/finance/ModalShell';
import type { DebtWithProjection } from '@/lib/debt-data';
import { toDateKey } from '@/lib/debt-engine';
import { metaDesdeDeuda, type MetaPropuesta, type PorQueNo } from '@/lib/deuda-a-meta';
import { haptic } from '@/lib/haptic';
import { BTN_PRIMARY, BTN_SOFT, fmtDateFull, fmtDateKey, fmtMoney } from './debt-ui';

interface Props {
  /** Los tramos de la tarjeta, o la deuda suelta. Con saldos ENTEROS. */
  readonly deudas: readonly DebtWithProjection[];
  /** El nombre de la tarjeta o de la deuda, para el encabezado. */
  readonly titulo: string;
  /** Las deudas que ya persigue alguna meta. */
  readonly enMetas: ReadonlySet<string>;
  readonly onClose: () => void;
  /** Las deudas que quedaron en Metas (creadas ahora o que ya estaban). */
  readonly onEnMetas: (debtIds: string[]) => void;
}

/** Lo que responde POST /api/finance/goals/from-debts. */
interface Respuesta {
  creadas?: { id: string; name: string; debtId?: string | null }[];
  omitidas?: { debtId: string; motivo: PorQueNo }[];
  error?: string;
}

/** La fecha de la meta, dicha en una línea: de dónde sale ya se entiende. */
function chipDeFecha(m: MetaPropuesta, nuncaTermina: boolean): string {
  if (m.porQue === 'promo' && m.targetDate) return `⏳ Antes del ${fmtDateFull(m.targetDate)} · fin del 0 %`;
  if (m.porQue === 'ritmo' && m.targetDate) return `🏁 A tu ritmo: ${fmtDateKey(m.targetDate)}`;
  return nuncaTermina ? '🛑 Así no termina · sin fecha' : '🗓️ Sin fecha';
}

const OMITIDA: Record<PorQueNo, string> = {
  ya_en_metas: '✓ Ya en Metas',
  pagada: '🎉 Pagada',
  archivada: 'Archivada',
  no_encontrada: 'No encontrada',
};

/**
 * «🎯 Pasar a Metas»: la deuda propone su propia meta y se crea de un toque.
 *
 * Antes había que ir al Plan, abrir «Nueva meta», elegir «Deuda» y teclear el
 * nombre, el objetivo, lo pagado y la fecha — cinco datos que Deudas ya tenía.
 * Aquí se ven ya rellenos, tal cual saldrán en el Plan (las cifras salen de la
 * misma función con la que el Plan las leerá), y en una tarjeta con tramos
 * cada tramo es su propia meta, porque cada uno tiene su fecha: el 0 % que se
 * acaba no corre al mismo ritmo que el saldo al 23.99 %.
 *
 * Todas van marcadas: lo normal es pasarlas todas. Tocar una la quita.
 */
export default function PasarAMetasSheet({ deudas, titulo, enMetas, onClose, onEnMetas }: Props) {
  const hoy = toDateKey(new Date());
  const filas = useMemo(
    () =>
      deudas
        .map((d) => ({ deuda: d, propuesta: metaDesdeDeuda(d, hoy, enMetas) }))
        // Lo que se puede crear, arriba; lo que no, debajo y apagado.
        .sort((a, b) => Number(b.propuesta.ok) - Number(a.propuesta.ok) || b.deuda.currentBalance - a.deuda.currentBalance),
    [deudas, hoy, enMetas],
  );
  const posibles = filas.filter((f) => f.propuesta.ok).map((f) => f.deuda.id);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(posibles));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creadas, setCreadas] = useState<string[] | null>(null);

  const elegidas = posibles.filter((id) => marcadas.has(id));
  const currency = deudas[0]?.currency ?? 'USD';

  function alternar(id: string) {
    haptic(6);
    setError(null);
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function crear() {
    if (elegidas.length === 0 || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/goals/from-debts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debtIds: elegidas }),
      });
      const data = (await res.json().catch(() => ({}))) as Respuesta;
      if (!res.ok) throw new Error(data.error ?? 'No se pudo pasar a Metas');

      const nuevas = (data.creadas ?? []).map((g) => g.debtId).filter((x): x is string => Boolean(x));
      // Las que el servidor encontró ya enganchadas también están en Metas: un
      // segundo toque desde otra pestaña no es un error, es la misma meta.
      const yaEstaban = (data.omitidas ?? []).filter((o) => o.motivo === 'ya_en_metas').map((o) => o.debtId);
      onEnMetas([...nuevas, ...yaEstaban]);
      setCreadas((data.creadas ?? []).map((g) => g.name));
      haptic([10, 40, 10]);
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setError(offline ? 'Sin conexión. Prueba otra vez cuando vuelva la señal.' : (err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ─── Hecho ──────────────────────────────────────────────────────────────
  if (creadas) {
    return (
      <ModalShell
        title="En tus Metas"
        subtitle={titulo}
        emoji="🎯"
        onClose={onClose}
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
              Listo
            </button>
            <Link
              href="/plan#metas"
              onClick={() => haptic()}
              className={`flex flex-[1.4] items-center justify-center rounded-2xl py-3.5 text-sm ${BTN_PRIMARY}`}
            >
              Ver mis Metas →
            </Link>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <motion.span
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
            className="grid h-20 w-20 place-items-center rounded-full bg-white text-5xl shadow-sm"
            aria-hidden="true"
          >
            🎯
          </motion.span>
          <p className="text-lg font-black text-black">
            {creadas.length === 0
              ? 'Ya estaba en tus Metas'
              : creadas.length === 1
                ? '1 meta nueva'
                : `${creadas.length} metas nuevas`}
          </p>
          {creadas.length > 0 && (
            <ul className="flex w-full flex-col gap-1.5">
              {creadas.map((n, i) => (
                <motion.li
                  key={n + i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.07 }}
                  className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-black"
                >
                  <CheckCircleIcon className="h-5 w-5 shrink-0 text-sky-500" aria-hidden="true" />
                  <span className="truncate">{n}</span>
                </motion.li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">Cada abono en Deudas la mueve sola.</p>
        </div>
      </ModalShell>
    );
  }

  // ─── Vista previa ───────────────────────────────────────────────────────
  return (
    <ModalShell
      title="Pasar a Metas"
      subtitle={titulo}
      emoji="🎯"
      onClose={onClose}
      footer={
        posibles.length > 0 ? (
          <button
            type="button"
            onClick={crear}
            disabled={elegidas.length === 0 || guardando}
            aria-busy={guardando}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-50 disabled:active:scale-100`}
          >
            {guardando ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                Creando…
              </>
            ) : elegidas.length === 1 ? (
              '🎯 Crear la meta'
            ) : (
              `🎯 Crear ${elegidas.length} metas`
            )}
          </button>
        ) : (
          <Link
            href="/plan#metas"
            onClick={() => haptic()}
            className={`flex w-full items-center justify-center rounded-2xl py-3.5 text-sm ${BTN_PRIMARY}`}
          >
            Ver mis Metas →
          </Link>
        )
      }
    >
      <ul className="flex flex-col gap-2.5">
        {filas.map(({ deuda, propuesta }) => {
          if (!propuesta.ok) {
            return (
              <li
                key={deuda.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3.5 py-3 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-slate-500">{deuda.name}</span>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-sky-700">
                  {OMITIDA[propuesta.motivo]}
                </span>
              </li>
            );
          }
          const m = propuesta.meta;
          const on = marcadas.has(deuda.id);
          const pct = m.targetAmount > 0 ? Math.round((m.savedAmount / m.targetAmount) * 100) : 0;
          return (
            <li key={deuda.id}>
              <motion.button
                type="button"
                layout
                whileTap={{ scale: 0.98 }}
                onClick={() => alternar(deuda.id)}
                aria-pressed={on}
                disabled={guardando}
                className={`relative flex w-full flex-col gap-2.5 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors ${
                  // `/60` y no `/50`: solo las variantes con línea en el bloque
                  // `html.dark` de globals.css se oscurecen.
                  on ? 'border-sky-500 bg-white shadow-sm' : 'border-transparent bg-white/60'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl transition-opacity ${
                      on ? 'bg-sky-50' : 'bg-white/70 opacity-50'
                    }`}
                    aria-hidden="true"
                  >
                    {m.emoji}
                  </span>
                  <span className={`min-w-0 flex-1 transition-opacity ${on ? '' : 'opacity-50'}`}>
                    <span className="block truncate text-sm font-bold text-black">{m.name}</span>
                    <span className="block text-[11px] font-semibold text-slate-500">
                      Meta {fmtMoney(m.targetAmount, currency)}
                    </span>
                  </span>
                  <span className={`shrink-0 text-right transition-opacity ${on ? '' : 'opacity-50'}`}>
                    <span className="block text-base font-extrabold text-black">{fmtMoney(m.falta, currency)}</span>
                    <span className="block text-[11px] text-slate-400">falta</span>
                  </span>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.span
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-white"
                        aria-hidden="true"
                      >
                        <CheckCircleIcon className="h-6 w-6 text-sky-500" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>

                {/* Lo pagado de esa meta: arranca donde va la deuda, no en cero. */}
                <span className={`flex items-center gap-2 transition-opacity ${on ? '' : 'opacity-50'}`}>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-sky-100">
                    <span
                      className="block h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%` }}
                    />
                  </span>
                  {/* Ancho fijo para que las barras de los tramos queden alineadas;
                      sin `nowrap`, «36 % pagado» se partía en dos líneas. */}
                  <span className="w-[76px] shrink-0 whitespace-nowrap text-right text-[11px] font-semibold text-slate-500">
                    {pct} % pagado
                  </span>
                </span>

                <span
                  className={`self-start rounded-full px-2.5 py-1 text-[11px] font-bold transition-opacity ${
                    m.porQue === 'promo' ? 'bg-blue-100 text-blue-800' : 'bg-sky-50 text-sky-700'
                  } ${on ? '' : 'opacity-50'}`}
                >
                  {chipDeFecha(m, deuda.projection.neverPaysOff)}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>

      {posibles.length === 0 && (
        <p className="mt-4 text-center text-sm font-semibold text-slate-600">✅ Todo está ya en tus Metas</p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-semibold text-blue-900">
          {error}
        </p>
      )}
    </ModalShell>
  );
}
