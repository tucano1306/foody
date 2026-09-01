'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { DebtWithProjection } from '@/lib/debt-data';
import type { DebtOverview } from '@/lib/finance-engine';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';
import { fmtMoney } from './finance-ui';

/**
 * Los cuatro modales de Deudas se cargan al tocar, no al abrir el plan.
 *
 * Son pesados —el detalle trae tres pestañas con tabla de amortización, el
 * alta es un asistente de varios pasos— y la inmensa mayoría de las visitas al
 * plan no abre ninguno. Estáticos, los arrastraría el bundle de una pantalla
 * que se mira todos los días desde el móvil.
 */
const DebtDetailSheet = dynamic(() => import('@/components/debts/DebtDetailSheet'), { ssr: false });
const DebtEditModal = dynamic(() => import('@/components/debts/DebtEditModal'), { ssr: false });
const DebtPaymentModal = dynamic(() => import('@/components/debts/DebtPaymentModal'), { ssr: false });
const DebtWizardModal = dynamic(() => import('@/components/debts/DebtWizardModal'), { ssr: false });

interface Props {
  readonly debts: DebtOverview;
  /** Se tocó una deuda: los totales del plan tienen que recalcularse. */
  readonly onChanged: () => void;
}

/** Qué modal está abierto sobre el panel. */
type DebtModal =
  | { kind: 'none' }
  | { kind: 'detail'; debt: DebtWithProjection }
  | { kind: 'edit'; debt: DebtWithProjection }
  | { kind: 'pay'; debt: DebtWithProjection }
  | { kind: 'new' };

/**
 * Plan de salida de deuda: los pagos atrasados en orden de bola de nieve
 * (el más pequeño primero) con el abono mensual sugerido y el mes de liquidación.
 */
export default function DebtPanel({ debts, onChanged }: Props) {
  const toast = useToast();
  const [modal, setModal] = useState<DebtModal>({ kind: 'none' });
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const close = useCallback(() => setModal({ kind: 'none' }), []);

  /**
   * El plan solo guarda un RESUMEN de cada crédito (saldo, cuota, interés);
   * los modales necesitan la deuda entera con su proyección. Se pide al tocar
   * y no al montar la página: son datos que casi nunca se miran, y traerlos
   * todos por si acaso encarece cada carga del plan.
   */
  const open = useCallback(async (id: string) => {
    haptic();
    setLoadingId(id);
    try {
      const res = await fetch(`/api/debts/${id}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error();
      setModal({ kind: 'detail', debt: (await res.json()) as DebtWithProjection });
    } catch {
      toast.show('No se pudo abrir la deuda', 'error');
    } finally {
      setLoadingId(null);
    }
  }, [toast]);

  /** Cualquier cambio cierra lo que haya abierto y recalcula el plan. */
  const afterChange = useCallback(() => {
    close();
    onChanged();
  }, [close, onChanged]);

  if (debts.overdueTotal <= 0 && debts.creditBalance <= 0) return null;

  const max = Math.max(...debts.payoffOrder.map((d) => d.debt), 1);

  return (
    <div className="space-y-4">
      {/* ─── Tarjetas y créditos ───────────────────────────────────────────
          Van primero porque son la deuda que CUESTA: mientras exista el saldo
          genera interés cada mes, cosa que un recibo atrasado no hace. */}
      {debts.creditBalance > 0 && (
        <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide text-black">
                💳 Tarjetas y créditos
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {debts.creditMonthlyInterest > 0
                  ? `Te cuestan ${fmtMoney(debts.creditMonthlyInterest)} al mes solo en intereses`
                  : 'Sin intereses este mes'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Saldo</p>
              <p className="text-xl font-black tabular-nums text-black">
                {fmtMoney(debts.creditBalance)}
              </p>
            </div>
          </div>

          {/* Cada crédito abre su hoja: ahí se abona, se edita y se elimina.
              Antes esto era una lista de solo lectura y un botón al final que
              mandaba a otra pantalla a hacer lo mismo. */}
          <ul className="space-y-2">
            {debts.creditOrder.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => void open(c.id)}
                  disabled={loadingId !== null}
                  className="flex w-full items-center gap-2.5 rounded-2xl bg-white/70 px-3 py-2.5 text-left transition active:scale-[0.99] hover:bg-white disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-black">{c.name}</span>
                    <span className="block text-[11px] text-slate-500">
                      {loadingId === c.id
                        ? 'Abriendo…'
                        : c.neverPaysOff
                          ? '🛑 Con esta cuota no termina nunca'
                          : `Cuota ${fmtMoney(c.installment)}/mes · ${
                              c.monthsToPayoff === null ? '—' : `libre en ${c.monthsToPayoff} ${c.monthsToPayoff === 1 ? 'mes' : 'meses'}`
                            }`}
                    </span>
                    {/* Su cuota ya la cobra un recibo de Pagos, así que NO
                        entra en el total de abajo. Sin decirlo, las filas
                        sumarían más que «Comprometido al mes» y parecería un
                        error de la app — justo lo contrario de lo que es. */}
                    {c.countedInPayments && (
                      <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                        Ya contada en Pagos
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black tabular-nums text-black">{fmtMoney(c.balance)}</span>
                    {c.monthlyInterest > 0 && (
                      <span className="block text-[11px] font-semibold text-blue-700">
                        +{fmtMoney(c.monthlyInterest)} interés
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-sm text-slate-300">›</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Comprometido al mes
              </p>
              <p className="text-lg font-black tabular-nums text-black">
                {fmtMoney(debts.creditPayments)}
                <span className="text-xs font-medium text-slate-400">/mes</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {debts.creditOrder.some((c) => c.countedInPayments)
                  ? 'Sin contar las cuotas que ya cobra un recibo de Pagos'
                  : 'Ya restado de tu dinero libre'}
              </p>
            </div>
            {/* En lugar de mandar a otra pantalla a hacer lo que ya se puede
                hacer aquí, el pie ofrece lo único que faltaba: dar de alta. */}
            <button
              type="button"
              onClick={() => { haptic(12); setModal({ kind: 'new' }); }}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-blue-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95 hover:bg-blue-600"
            >
              <PlusIcon className="h-4 w-4" />
              Agregar
            </button>
          </div>
        </section>
      )}

      {debts.overdueTotal > 0 && (
    <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black text-black uppercase tracking-wide">
            🔴 Plan de salida de deuda
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Método bola de nieve: liquida primero la más pequeña.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-600 font-bold">Total</p>
          <p className="text-xl font-black text-black tabular-nums">{fmtMoney(debts.overdueTotal)}</p>
        </div>
      </div>

      <ol className="space-y-2.5">
        {debts.payoffOrder.map((debt, i) => (
          <motion.li
            key={debt.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl bg-white/70 px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black ${
                  i === 0 ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-black truncate">{debt.name}</p>
                <p className="text-[11px] text-slate-500">
                  {debt.missedMonths} {debt.missedMonths === 1 ? 'mes' : 'meses'} sin registrar
                </p>
              </div>
              <span className="text-sm font-black text-black tabular-nums shrink-0">
                {fmtMoney(debt.debt)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white mt-2 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-linear-to-r from-blue-400 to-blue-400"
                initial={{ width: 0 }}
                animate={{ width: `${(debt.debt / max) * 100}%` }}
                transition={{ duration: 0.7, delay: i * 0.07 }}
              />
            </div>
          </motion.li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Abono sugerido</p>
          <p className="text-lg font-black text-black tabular-nums">
            {fmtMoney(debts.monthlyCatchUp)}<span className="text-xs font-medium text-slate-400">/mes</span>
          </p>
          <p className="text-[11px] text-slate-500">
            {debts.monthsToClear
              ? `Libre de atrasos en ${debts.monthsToClear} ${debts.monthsToClear === 1 ? 'mes' : 'meses'}`
              : 'Sin dinero libre para abonar — primero hay que bajar gastos'}
          </p>
        </div>
        <Link
          href="/payments"
          className="shrink-0 px-4 py-2.5 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition"
        >
          Ver pagos →
        </Link>
      </div>
    </section>
      )}

      {/* ─── Modales ────────────────────────────────────────────────────────
          Los mismos que usa la sección Deudas: abonar, editar, dar de alta y
          la hoja de detalle con su historial. Reutilizarlos —en vez de hacer
          aquí una versión reducida— evita que las dos pantallas se separen y
          que un campo editable en una falte en la otra. */}
      {modal.kind === 'detail' && (
        <DebtDetailSheet
          debt={modal.debt}
          onClose={close}
          // La hoja sigue abierta con el dato fresco; el plan se recalcula
          // detrás para que los totales de arriba no se queden viejos.
          onChanged={(updated) => { setModal({ kind: 'detail', debt: updated }); onChanged(); }}
          onDeleted={() => { toast.show('Deuda eliminada', 'success'); afterChange(); }}
          onPay={() => setModal({ kind: 'pay', debt: modal.debt })}
          onEdit={() => setModal({ kind: 'edit', debt: modal.debt })}
        />
      )}
      {modal.kind === 'edit' && (
        <DebtEditModal
          debt={modal.debt}
          onClose={() => setModal({ kind: 'detail', debt: modal.debt })}
          onSaved={(updated) => { setModal({ kind: 'detail', debt: updated }); onChanged(); }}
        />
      )}
      {modal.kind === 'pay' && (
        <DebtPaymentModal
          debt={modal.debt}
          onClose={() => setModal({ kind: 'detail', debt: modal.debt })}
          onPaid={(updated) => { setModal({ kind: 'detail', debt: updated }); onChanged(); }}
        />
      )}
      {modal.kind === 'new' && (
        <DebtWizardModal
          currency="USD"
          onClose={close}
          onCreated={() => { toast.show('Deuda agregada', 'success'); afterChange(); }}
        />
      )}
    </div>
  );
}
