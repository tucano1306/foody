'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CardStatementInfo, DebtMovement, DebtWithProjection } from '@/lib/debt-data';
import { cardTitle } from '@/lib/card-payment';
import type { CondicionesDeCredito } from '@/lib/condiciones-credito';
import { historialDeLaTarjeta, type LineaDelHistorial } from '@/lib/historial-tarjeta';
import { haptic } from '@/lib/haptic';
import ModalShell from '@/components/finance/ModalShell';
import BotonMas from './BotonMas';
import MinimoDeLaTarjeta from './MinimoDeLaTarjeta';
import TramosDeTarjeta from './TramosDeTarjeta';
import { BTN_PRIMARY, fmtMoney, MOVEMENT_META } from './debt-ui';

/** Cuántos movimientos se piden de cada tramo: los de los últimos meses. */
const POR_TRAMO = 25;

interface Props {
  /** Los mismos tramos que enseña su tarjeta en la lista. */
  readonly tramos: readonly DebtWithProjection[];
  readonly estado: CardStatementInfo | null;
  readonly condiciones: CondicionesDeCredito | null;
  readonly onClose: () => void;
  readonly onOpenTramo: (id: string) => void;
  readonly onPay: () => void;
  readonly onMenu?: () => void;
}

/**
 * Dentro de una tarjeta con tramos: lo que debe entera, el mínimo del estado,
 * cada saldo y el historial de todos juntos.
 *
 * Una deuda suelta se tocaba y abría su hoja; la tarjeta de tramos no tenía
 * adónde entrar, y su historial estaba repartido en la hoja de cada tramo. Un
 * abono a la tarjeta se veía, además, en trozos —uno por saldo— que no se
 * parecían al pago que se hizo. Aquí sale entero (ver `historialDeLaTarjeta`).
 *
 * Corregir o deshacer un movimiento se sigue haciendo en la hoja de su tramo,
 * que es quien lo tiene: tocar un saldo lleva allí.
 */
export default function CardDetailSheet({ tramos, estado, condiciones, onClose, onOpenTramo, onPay, onMenu }: Props) {
  const titulo = cardTitle(tramos);
  const currency = tramos[0]?.currency ?? 'USD';
  const total = tramos.reduce((s, t) => s + t.currentBalance, 0);
  const interesMes = tramos.reduce((s, t) => s + t.projection.monthlyInterest, 0);
  const ordenados = [...tramos].sort((a, b) => b.currentBalance - a.currentBalance);

  const [lineas, setLineas] = useState<LineaDelHistorial[] | null>(null);
  const [fallo, setFallo] = useState(false);

  // La clave son los ids y los saldos: un abono cambia un saldo y el
  // historial tiene que traer ese abono, pero un re-render cualquiera no debe
  // volver a pedirlo todo.
  const clave = tramos.map((t) => `${t.id}:${t.currentBalance}`).join('|');
  const nombres = useMemo(() => new Map(tramos.map((t) => [t.id, t.name])), [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true;
    setFallo(false);
    Promise.all(
      [...nombres.keys()].map(async (id) => {
        const res = await fetch(`/api/debts/${id}/movements?limit=${POR_TRAMO}`, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        return { tramo: nombres.get(id) ?? '', movimientos: (await res.json()) as DebtMovement[] };
      }),
    )
      .then((libros) => {
        if (vivo) setLineas(historialDeLaTarjeta(libros));
      })
      .catch(() => {
        if (vivo) {
          setFallo(true);
          setLineas([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, [nombres]);

  return (
    <ModalShell
      title={titulo}
      subtitle={`${tramos.length} tramos · un solo mínimo`}
      emoji="💳"
      onClose={onClose}
      footer={
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => {
              haptic();
              onPay();
            }}
            className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_PRIMARY}`}
          >
            💸 Abonar a la tarjeta
          </button>
          {onMenu && <BotonMas onClick={onMenu} de={titulo} />}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-500">Debes hoy</p>
            <p className="text-3xl font-extrabold leading-tight text-black tabular-nums">{fmtMoney(total, currency)}</p>
          </div>
          {interesMes > 0 && (
            <p className="text-right text-xs font-semibold text-blue-700">
              +{fmtMoney(interesMes, currency)}
              <span className="block text-[11px] font-medium text-slate-500">de interés al mes</span>
            </p>
          )}
        </div>

        <MinimoDeLaTarjeta tramos={tramos} estado={estado} condiciones={condiciones} />

        <TramosDeTarjeta
          titulo={titulo}
          tramos={ordenados.map((t) => ({ ...t, balance: t.currentBalance }))}
          formatoSaldo={(t) => fmtMoney(t.balance, t.currency)}
          onOpen={(id) => {
            haptic();
            onOpenTramo(id);
          }}
        />

        <section aria-label={`Movimientos de ${titulo}`} className="space-y-2">
          <h3 className="text-xs font-bold text-slate-600">Movimientos</h3>
          {lineas === null && <p className="py-4 text-center text-xs text-slate-400">Cargando…</p>}
          {fallo && <p className="py-4 text-center text-xs text-slate-500">No se pudo cargar el historial</p>}
          {lineas !== null && !fallo && lineas.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">Aún no hay movimientos</p>
          )}
          {lineas !== null && lineas.length > 0 && (
            <ul className="space-y-2">
              {lineas.map((l) => {
                const meta = MOVEMENT_META[l.kind] ?? MOVEMENT_META.adjustment;
                return (
                  <li key={l.id} className="rounded-2xl bg-white px-3.5 py-3 ring-1 ring-sky-100">
                    <div className="flex items-center gap-3">
                      <span className="text-xl" aria-hidden="true">{meta.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-black">
                          {l.aLaTarjeta ? 'Abono a la tarjeta' : `${meta.label} · ${l.partes[0]?.tramo ?? ''}`}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {new Date(l.occurredAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {l.note && ` · ${l.note}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-extrabold tabular-nums text-black">
                        {meta.sign}
                        {fmtMoney(l.amount, currency, 2)}
                      </span>
                    </div>
                    {/* A qué saldo fue cada parte: la pregunta de siempre con
                        un abono a una tarjeta de tramos. */}
                    {l.aLaTarjeta && (
                      <ul className="mt-2 space-y-0.5 border-t border-sky-50 pt-2 text-[11px] text-slate-500">
                        {l.partes.map((p) => (
                          <li key={p.tramo} className="flex justify-between gap-3">
                            <span className="truncate">{p.tramo}</span>
                            <span className="shrink-0 tabular-nums">{fmtMoney(p.amount, currency, 2)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </ModalShell>
  );
}
