'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { CardStatementInfo, CreditForPlan, DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { cardTitle, ultimosDeLaTarjeta } from '@/lib/card-payment';
import { claveDeCuenta, type CondicionesDeCredito } from '@/lib/condiciones-credito';
import { toDateKey } from '@/lib/debt-engine';
import { avisoDePromo } from '@/lib/debt-promo';
import type { DebtOverview } from '@/lib/finance-engine';
import { resumenDeLoVisible } from '@/lib/fuera-del-plan';
import { haptic } from '@/lib/haptic';
import { agruparPorTarjeta } from '@/lib/plan-tarjetas';
import { useToast } from '@/components/ui/Toast';
import ChipDeCuenta from '@/components/debts/ChipDeCuenta';
import PromoAviso from '@/components/debts/PromoAviso';
import PlanCardGroup, { QuitarDelPlan } from './PlanCardGroup';
import { fmtMoney, fmtMoneyFine } from './finance-ui';

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
const CardPaymentModal = dynamic(() => import('@/components/debts/CardPaymentModal'), { ssr: false });
const CardStatementModal = dynamic(() => import('@/components/debts/CardStatementModal'), { ssr: false });

interface Props {
  readonly debts: DebtOverview;
  /**
   * Los créditos tal como llegan del servidor: de ellos sale lo que el
   * resumen del motor no lleva —la tarjeta de cada tramo, su promoción—, que
   * es lo que hace que el plan las pinte como Deudas.
   */
  readonly credits?: readonly CreditForPlan[];
  /** El último estado de cuenta de cada tarjeta con tramos. */
  readonly estados?: Readonly<Record<string, CardStatementInfo>>;
  /** Se tocó una deuda: los totales del plan tienen que recalcularse. */
  readonly onChanged: () => void;
}

/** Qué modal está abierto sobre el panel. */
type DebtModal =
  | { kind: 'none' }
  | { kind: 'detail'; debt: DebtWithProjection }
  | { kind: 'edit'; debt: DebtWithProjection }
  | { kind: 'pay'; debt: DebtWithProjection }
  | { kind: 'new' }
  | { kind: 'card-pay'; tramos: DebtWithProjection[]; estado: CardStatementInfo | null; condiciones: CondicionesDeCredito | null }
  | { kind: 'card-cuadrar'; tramos: DebtWithProjection[]; estado: CardStatementInfo | null };

/**
 * Plan de salida de deuda: los pagos atrasados en orden de bola de nieve
 * (el más pequeño primero) con el abono mensual sugerido y el mes de liquidación.
 */
export default function DebtPanel({ debts, credits = [], estados = {}, onChanged }: Props) {
  const toast = useToast();
  const [modal, setModal] = useState<DebtModal>({ kind: 'none' });
  const [loadingId, setLoadingId] = useState<string | null>(null);
  /**
   * Lo último que el dueño tocó, por cuenta (true = fuera del Plan). Manda
   * sobre lo que trajo el servidor para que la tarjeta se vaya EN EL TOQUE y no
   * cuando vuelva la respuesta; si el guardado falla, se deshace.
   */
  const [tocadas, setTocadas] = useState<Readonly<Record<string, boolean>>>({});

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

  /**
   * Abonar o cuadrar una tarjeta necesita sus tramos ENTEROS, con proyección
   * y estado de cuenta, que el plan no carga. Se piden al tocar, como la hoja
   * de una deuda: los mismos modales que en Deudas, con los mismos datos.
   */
  const openCard = useCallback(async (grupo: string, accion: 'card-pay' | 'card-cuadrar') => {
    haptic();
    setLoadingId(grupo);
    try {
      const res = await fetch('/api/debts', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error();
      const snapshot = (await res.json()) as DebtsSnapshot;
      const tramos = snapshot.debts.filter((d) => d.cardGroup === grupo && d.status === 'active');
      if (tramos.length === 0) throw new Error();
      const estado = snapshot.cardStatements?.[grupo] ?? null;
      setModal(
        accion === 'card-pay'
          ? { kind: accion, tramos, estado, condiciones: snapshot.creditTerms?.[grupo] ?? null }
          : { kind: accion, tramos, estado },
      );
    } catch {
      toast.show('No se pudo abrir la tarjeta', 'error');
    } finally {
      setLoadingId(null);
    }
  }, [toast]);

  /** Cualquier cambio cierra lo que haya abierto y recalcula el plan. */
  const afterChange = useCallback(() => {
    close();
    onChanged();
  }, [close, onChanged]);

  /**
   * Quitar una cuenta del Plan, o devolverla. Desde aquí se borraron una vez
   * unas tarjetas reales creyendo quitarlas del Plan; ahora el Plan no borra:
   * esto solo cambia lo que el Plan enseña (fuera-del-plan.ts).
   *
   * Sin confirmación porque no se pierde nada, y el aviso dice dónde sigue la
   * tarjeta —lo que el dueño quería tener seguro— y trae «Deshacer».
   *
   * No recalcula el plan: su dinero no cambia (la cuota sigue contando en el
   * flujo del mes), así que no hace falta volver a pedirlo entero.
   */
  async function ponerEnPlan(debtId: string, clave: string, enPlan: boolean) {
    haptic(enPlan ? 8 : 12);
    setTocadas((t) => ({ ...t, [clave]: !enPlan }));
    try {
      const res = await fetch(`/api/debts/${debtId}/plan`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enPlan }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (enPlan) {
        toast.show('De vuelta en el Plan', 'success');
      } else {
        toast.show('Fuera del Plan · sigue en Deudas', 'success', {
          etiqueta: 'Deshacer',
          alTocar: () => void ponerEnPlan(debtId, clave, true),
        });
      }
    } catch {
      setTocadas((t) => ({ ...t, [clave]: enPlan }));
      toast.show(enPlan ? 'No se pudo volver a mostrar' : 'No se pudo quitar del Plan', 'error');
    }
  }

  if (debts.overdueTotal <= 0 && debts.creditBalance <= 0) return null;

  const max = Math.max(...debts.payoffOrder.map((d) => d.debt), 1);
  const hoy = toDateKey(new Date());

  // El resumen del motor con lo que el servidor sabe de cada tramo. Si un
  // crédito no trae detalle (un plan recalculado con datos viejos), se pinta
  // suelto como antes: nunca desaparece una deuda por faltar un adorno.
  const detalle = new Map(credits.map((c) => [c.id, c]));
  const enriquecidos = debts.creditOrder.map((c) => {
    const d = detalle.get(c.id);
    const cardGroup = d?.cardGroup ?? null;
    const clave = claveDeCuenta({ id: c.id, cardGroup });
    return {
      ...c,
      clave,
      fueraDelPlan: tocadas[clave] ?? d?.fueraDelPlan ?? false,
      cardGroup,
      kind: d?.kind ?? null,
      issuer: d?.issuer ?? null,
      accountLast4: d?.accountLast4 ?? null,
      currency: d?.currency ?? 'USD',
      rate: d?.rate ?? 0,
      ratePeriod: d?.ratePeriod ?? 'annual_nominal',
      promoEndsOn: d?.promoEndsOn ?? null,
      rateAfterPromo: d?.rateAfterPromo ?? null,
      promoKind: d?.promoKind ?? 'cero',
      deferredInterest: d?.deferredInterest ?? null,
      openedAt: d?.openedAt ?? null,
    };
  });
  const visibles = enriquecidos.filter((c) => !c.fueraDelPlan);
  const filas = agruparPorTarjeta(visibles);
  const filasFuera = agruparPorTarjeta(enriquecidos.filter((c) => c.fueraDelPlan));
  // Las cifras de la cabecera y del pie, de lo que SE VE. El motor sigue
  // contando todo (el dinero es real), y lo cuenta el flujo del mes.
  const resumen = resumenDeLoVisible(visibles);

  return (
    <div className="space-y-4">
      {/* ─── Tarjetas y créditos ───────────────────────────────────────────
          Van primero porque son la deuda que CUESTA: mientras exista el saldo
          genera interés cada mes, cosa que un recibo atrasado no hace. */}
      {visibles.length > 0 && (
        <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-black">
                💳 Tarjetas y créditos
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {resumen.monthlyInterest > 0
                  ? `Te cuestan ${fmtMoney(resumen.monthlyInterest)} al mes solo en intereses`
                  : 'Sin intereses este mes'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-bold text-slate-600">Saldo</p>
              <p className="text-xl font-black tabular-nums text-black">
                {fmtMoney(resumen.balance)}
              </p>
            </div>
          </div>

          {/* Cada crédito abre su hoja: ahí se abona, se edita y se elimina.
              Antes esto era una lista de solo lectura y un botón al final que
              mandaba a otra pantalla a hacer lo mismo. */}
          {/* 16 px entre tarjetas y no 8: con 8, y todas del mismo tono, la
              lista se leía como un solo bloque y no se veía dónde acababa
              una tarjeta y empezaba la siguiente. */}
          <ul className="space-y-4">
            {filas.map((fila) => {
              if (fila.tipo === 'tarjeta') {
                return (
                  <li key={fila.grupo}>
                    <PlanCardGroup
                      grupo={fila.grupo}
                      tramos={fila.tramos}
                      estado={estados[fila.grupo] ?? null}
                      loadingId={loadingId}
                      onOpenTramo={(id) => void open(id)}
                      onPay={() => void openCard(fila.grupo, 'card-pay')}
                      onCuadrar={() => void openCard(fila.grupo, 'card-cuadrar')}
                      onQuitar={() => void ponerEnPlan(fila.tramos[0].id, fila.tramos[0].clave, false)}
                    />
                  </li>
                );
              }
              const c = fila.credito;
              const aviso = avisoDePromo({ ...c, currentBalance: c.balance }, hoy);
              return (
              // Una tarjeta suelta es una tarjeta como la de tramos: mismo
              // cuerpo (`card`) y mismo sello. Antes era una fila translúcida
              // idéntica a un tramo, y «Cash Rewards 8523» parecía otro saldo
              // de la tarjeta de al lado.
              <li key={c.id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => void open(c.id)}
                  disabled={loadingId !== null}
                  className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:opacity-60"
                >
                  <ChipDeCuenta ultimos={ultimosDeLaTarjeta([c])} kind={c.kind} />
                  <span className="min-w-0 flex-1">
                    {/* Sin `truncate`: con el sello al lado, a 375 px cortaba
                        en «Cash Reward…» y se perdía lo que distingue la
                        tarjeta. Mejor dos líneas que un nombre a medias. */}
                    <span className="block text-sm font-bold leading-tight text-black">{c.name}</span>
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
                      <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                        Ya contada en Pagos
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-black tabular-nums text-black">{fmtMoneyFine(c.balance)}</span>
                    {c.monthlyInterest > 0 && (
                      <span className="block text-[11px] font-semibold text-blue-700">
                        +{fmtMoney(c.monthlyInterest)} interés
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-sm text-slate-300">›</span>
                </button>
                {/* El mismo aviso del 0 % que en Deudas, también para una
                    tarjeta de un solo saldo. */}
                {aviso && (
                  <div className="-mt-1 px-4 pb-4">
                    <PromoAviso aviso={aviso} currency={c.currency} />
                  </div>
                )}
                <div className="-mt-2 pb-2">
                  <QuitarDelPlan
                    titulo={c.name}
                    disabled={loadingId !== null}
                    onQuitar={() => void ponerEnPlan(c.id, c.clave, false)}
                  />
                </div>
              </li>
              );
            })}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
            <div>
              <p className="text-[11px] font-bold text-slate-500">
                Comprometido al mes
              </p>
              <p className="text-lg font-black tabular-nums text-black">
                {fmtMoney(resumen.payments)}
                <span className="text-xs font-medium text-slate-400">/mes</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {visibles.some((c) => c.countedInPayments)
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

      {/* ─── Fuera del Plan ────────────────────────────────────────────────
          Plegado y al final, como las metas logradas: no estorba, pero lo que
          se quitó de aquí se devuelve aquí, sin ir a buscarlo a otra pantalla. */}
      {filasFuera.length > 0 && (
        <details className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 text-sm font-bold text-slate-700">
            <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
            Fuera del Plan · {filasFuera.length}
          </summary>
          <ul className="mt-3 space-y-2" aria-label="Fuera del Plan">
            {filasFuera.map((fila) => {
              const tramos = fila.tipo === 'tarjeta' ? fila.tramos : [fila.credito];
              const titulo = fila.tipo === 'tarjeta' ? cardTitle(tramos) : fila.credito.name;
              const primero = tramos[0];
              return (
                <li key={primero.clave} className="flex items-center gap-3">
                  <ChipDeCuenta ultimos={ultimosDeLaTarjeta(tramos)} kind={primero.kind} />
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-tight text-slate-700">{titulo}</span>
                  <button
                    type="button"
                    onClick={() => void ponerEnPlan(primero.id, primero.clave, true)}
                    aria-label={`Volver a mostrar ${titulo} en el Plan`}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-2 text-[11px] font-bold text-blue-600 ring-1 ring-sky-200 transition active:scale-95 hover:bg-sky-50"
                  >
                    <EyeIcon className="h-4 w-4" aria-hidden="true" /> Mostrar
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {debts.overdueTotal > 0 && (
    <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black text-black">
            🔴 Plan de salida de deuda
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Método bola de nieve: liquida primero la más pequeña.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-slate-600 font-bold">Total</p>
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
          <p className="text-[11px] text-slate-500 font-bold">Abono sugerido</p>
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
          // Sin `onDeleted`: desde el Plan no se borra ninguna deuda. En su
          // sitio, quitarla de esta pantalla (la tarjeta entera si va en una).
          onQuitarDelPlan={() => {
            const { id, cardGroup } = modal.debt;
            close();
            void ponerEnPlan(id, claveDeCuenta({ id, cardGroup }), false);
          }}
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
      {modal.kind === 'card-pay' && (
        <CardPaymentModal
          tramos={modal.tramos}
          estado={modal.estado}
          condiciones={modal.condiciones}
          onClose={close}
          // El modal se cierra solo tras asentar el abono; aquí solo hay que
          // recalcular el plan con los saldos nuevos.
          onPaid={() => onChanged()}
        />
      )}
      {modal.kind === 'card-cuadrar' && (
        <CardStatementModal
          tramos={modal.tramos}
          estado={modal.estado}
          onClose={close}
          onSaved={() => { toast.show('Tarjeta cuadrada con su estado de cuenta', 'success'); onChanged(); }}
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
