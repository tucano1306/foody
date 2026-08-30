'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrashIcon } from '@heroicons/react/24/outline';
import type { DebtMovement, DebtWithProjection } from '@/lib/debt-data';
import { buildSchedule, toMonthlyRate } from '@/lib/debt-engine';
import { promoRisk } from '@/lib/debt-promo';
import { haptic } from '@/lib/haptic';
import ModalShell from '@/components/finance/ModalShell';
import PayoffSimulator from './PayoffSimulator';
import SplitBar from './SplitBar';
import { parseMoney } from '@/lib/money-input';
import {
  BTN_PRIMARY,
  BTN_SOFT,
  fmtDateKey,
  fmtMonths,
  fmtMoney,
  fmtRate,
  KIND_META,
  MOVEMENT_META,
  STATUS_META,
  STRATEGY_META,
} from './debt-ui';

interface Props {
  readonly debt: DebtWithProjection;
  readonly onClose: () => void;
  readonly onChanged: (debt: DebtWithProjection) => void;
  readonly onDeleted: (id: string) => void;
  readonly onPay: () => void;
  readonly onEdit: () => void;
}

type Tab = 'summary' | 'plan' | 'ledger';

const TABS: readonly { id: Tab; label: string; emoji: string }[] = [
  { id: 'summary', label: 'Resumen', emoji: '📊' },
  { id: 'plan', label: 'Plan', emoji: '📆' },
  { id: 'ledger', label: 'Historial', emoji: '🧾' },
];

/** Fila de cifra: etiqueta a la izquierda, número en negro a la derecha. */
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span className={`${strong ? 'text-lg font-extrabold' : 'text-sm font-bold'} text-black`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Hoja de detalle de una deuda, en tres pestañas: dónde estás (Resumen), a
 * dónde vas (Plan, con la tabla de amortización) y de dónde vienes (Historial,
 * el libro mayor completo con cada interés y cada abono).
 */
export default function DebtDetailSheet({ debt, onClose, onChanged, onDeleted, onPay, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>('summary');
  const [movements, setMovements] = useState<DebtMovement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [realBalance, setRealBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Corregir el saldo sin romper la invariante: en vez de sobrescribir la
   * cifra, se asienta la DIFERENCIA como un ajuste. Así el libro mayor sigue
   * explicando de dónde sale cada dólar del saldo.
   */
  async function adjustBalance() {
    const target = parseMoney(realBalance);
    if (target === null || target < 0) {
      setError('Escribe cuánto debes en realidad');
      return;
    }
    const delta = Math.round((target - debt.currentBalance) * 100) / 100;
    if (delta === 0) { setAdjusting(false); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/debts/${debt.id}/movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          kind: 'adjustment',
          amount: delta,
          note: `Corrección de saldo a ${target.toFixed(2)}`,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo ajustar');
      }
      onChanged((await res.json()) as DebtWithProjection);
      setAdjusting(false);
      setRealBalance('');
      setMovements(null); // el historial se recarga con el ajuste dentro
      haptic();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const kind = KIND_META[debt.kind] ?? KIND_META.other;

  /** El riesgo de la promocion, solo si esta deuda tiene una. */
  const promo =
    debt.promoEndsOn && debt.rateAfterPromo != null && debt.currentBalance > 0
      ? promoRisk({
          balance: debt.currentBalance,
          installment: debt.projection.installment,
          promoEndsOn: debt.promoEndsOn,
          rateAfterPromo: debt.rateAfterPromo,
          ratePeriod: debt.ratePeriod,
        })
      : null;
  const status = STATUS_META[debt.projection.status];

  // La tabla se calcula en el cliente con el mismo motor que el servidor: es
  // instantánea al cambiar de pestaña y no gasta una llamada de red.
  const schedule = useMemo(
    () =>
      buildSchedule({
        balance: debt.currentBalance,
        monthlyRate: toMonthlyRate(debt.rate, debt.ratePeriod),
        payment: debt.projection.installment,
        startDate: new Date(),
        limit: 120,
        // La tabla tiene que enseñar el salto de tasa: sin esto, una promoción
        // al 0 % pintaba 120 cuotas sin un centavo de interés.
        rateAfter:
          promo && debt.rateAfterPromo != null
            ? {
                afterMonths: promo.monthsLeft,
                monthlyRate: toMonthlyRate(debt.rateAfterPromo, debt.ratePeriod),
              }
            : undefined,
      }),
    [debt, promo],
  );

  useEffect(() => {
    if (tab !== 'ledger' || movements !== null) return;
    fetch(`/api/debts/${debt.id}/movements`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DebtMovement[]) => setMovements(Array.isArray(data) ? data : []))
      .catch(() => setMovements([]));
  }, [tab, movements, debt.id]);

  async function removeMovement(movementId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/debts/${debt.id}/movements/${movementId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('No se pudo deshacer');
      onChanged((await res.json()) as DebtWithProjection);
      setMovements((prev) => prev?.filter((m) => m.id !== movementId) ?? null);
      haptic();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDebt() {
    setBusy(true);
    try {
      const res = await fetch(`/api/debts/${debt.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo borrar');
      onDeleted(debt.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={debt.name}
      subtitle={`${debt.issuer ?? kind.label} · ${fmtRate(debt.rate, debt.ratePeriod)}`}
      emoji={kind.emoji}
      onClose={onClose}
      footer={
        debt.currentBalance > 0 ? (
          <button type="button" onClick={onPay} className={`w-full rounded-2xl py-3.5 text-sm ${BTN_PRIMARY}`}>
            💸 Abonar
          </button>
        ) : (
          <button type="button" onClick={onClose} className={`w-full rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cerrar
          </button>
        )
      }
    >
      {/* Saldo protagonista */}
      <div className="mb-4 text-center">
        <p className="text-xs font-semibold text-slate-500">Debes hoy</p>
        <p className="text-4xl font-extrabold leading-tight text-black">
          {fmtMoney(debt.currentBalance, debt.currency)}
        </p>
        <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${status.chip}`}>
          {status.emoji} {status.label}
        </span>
      </div>

      {/* Pestañas */}
      <div className="mb-4 flex gap-1.5 rounded-2xl bg-sky-100/70 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              haptic();
              setTab(t.id);
            }}
            aria-pressed={tab === t.id}
            className={`relative flex-1 rounded-xl py-2.5 text-xs font-bold transition-colors duration-150 ${
              tab === t.id ? 'text-white' : 'text-slate-600'
            }`}
          >
            {tab === t.id && (
              <motion.span
                layoutId="debt-tab"
                className="absolute inset-0 rounded-xl bg-sky-500"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">
              <span aria-hidden="true">{t.emoji}</span> {t.label}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
          {error}
        </p>
      )}

      {/* ── Resumen ── */}
      {tab === 'summary' && (
        <div className="flex flex-col gap-4">
          {debt.projection.installment > 0 && debt.currentBalance > 0 && (
            <div className="rounded-3xl bg-sky-50/80 p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-slate-600">
                  Tu cuota · {STRATEGY_META[debt.strategy].label}
                </span>
                <span className="text-xl font-extrabold text-black">
                  {fmtMoney(debt.projection.installment, debt.currency)}
                </span>
              </div>
              <SplitBar
                interest={debt.projection.firstSplit.interest}
                principal={debt.projection.firstSplit.principal}
                currency={debt.currency}
              />
            </div>
          )}

          {/* La promoción que caduca.
              Va ARRIBA de todo lo demás porque es la única fecha de la tarjeta
              que tiene consecuencias: hasta ahora la pantalla decía «pagarás
              $0.00 de intereses» sin mencionar que ese 0 % tiene fecha de
              caducidad, ni cuánto costará el saldo que quede ese día. */}
          {promo && (
            <div
              className={`rounded-2xl border px-4 py-3.5 ${
                promo.willMissDeadline
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-sky-200 bg-sky-50/70'
              }`}
            >
              <p className="text-sm font-bold text-slate-900">
                {promo.willMissDeadline ? '⏳' : '✅'} 0 % hasta el {fmtDateKey(debt.promoEndsOn)}
              </p>
              {promo.willMissDeadline ? (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    A la cuota de ahora llegarás a esa fecha debiendo{' '}
                    <strong>{fmtMoney(promo.balanceAtEnd, debt.currency)}</strong>, y ese resto
                    empezará a costarte{' '}
                    <strong>{fmtMoney(promo.monthlyCostAfter, debt.currency)} al mes</strong> al{' '}
                    {debt.rateAfterPromo} %.
                  </p>
                  <p className="mt-1.5 text-xs font-bold text-sky-700">
                    Con {fmtMoney(promo.installmentToClear, debt.currency)} al mes
                    {promo.extraNeeded > 0 && ` (${fmtMoney(promo.extraNeeded, debt.currency)} más)`}{' '}
                    la liquidas a tiempo y no pagas ni un centavo de interés.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-slate-700">
                  Vas bien: a este ritmo la liquidas antes de que el 0 % se acabe, así que no
                  pagarás intereses.
                </p>
              )}
            </div>
          )}

          {debt.advice.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-sky-200 border-l-4 border-l-sky-500 bg-sky-50/70 px-4 py-3"
            >
              <p className="text-sm font-bold text-slate-900">
                <span aria-hidden="true">{a.icon}</span> {a.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{a.body}</p>
            </div>
          ))}

          <div className="divide-y divide-sky-100 rounded-2xl bg-white px-4 ring-1 ring-sky-100">
            <Row label="Capital pendiente" value={fmtMoney(debt.breakdown.principalOwed, debt.currency)} />
            {debt.breakdown.interestOwed > 0 && (
              <Row label="Interés acumulado" value={fmtMoney(debt.breakdown.interestOwed, debt.currency)} />
            )}
            <Row label="Interés cada mes" value={fmtMoney(debt.projection.monthlyInterest, debt.currency)} />
            <Row label="Tasa anual real" value={`${(debt.projection.annualEffectiveRate * 100).toFixed(1)} %`} />
            <Row label="Ya abonaste" value={fmtMoney(debt.breakdown.totalPaid, debt.currency)} />
            <Row
              label="De eso, intereses"
              value={fmtMoney(debt.breakdown.totalInterestPaid, debt.currency)}
            />
            <Row label="Día de pago" value={`Día ${debt.dueDay} de cada mes`} />
          </div>

          <PayoffSimulator debt={debt} />

          {/* Editar y corregir saldo. El saldo NO se edita como un campo: se
              corrige con un ajuste en el libro mayor, para que el historial
              siga explicando la cifra en vez de contradecirla. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { haptic(); onEdit(); }}
              className={`rounded-2xl py-3 text-sm ${BTN_SOFT}`}
            >
              ✏️ Editar datos
            </button>
            <button
              type="button"
              onClick={() => { haptic(); setAdjusting(true); }}
              className={`rounded-2xl py-3 text-sm ${BTN_SOFT}`}
            >
              🔧 Corregir saldo
            </button>
          </div>

          {adjusting && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
              <label htmlFor="debt-real-balance" className="mb-2 block text-xs font-bold text-slate-600">
                ¿Cuánto debes en realidad?
              </label>
              <input
                id="debt-real-balance"
                type="text"
                inputMode="decimal"
                value={realBalance}
                onChange={(e) => setRealBalance(e.target.value)}
                placeholder={debt.currentBalance.toFixed(2)}
                className="w-full rounded-2xl border-2 border-sky-200 bg-white px-4 py-3 text-right text-xl font-extrabold text-black focus:border-sky-400 focus:outline-none"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                Se anota como un ajuste en el historial — nada se borra.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAdjusting(false); setRealBalance(''); }}
                  className={`flex-1 rounded-2xl py-2.5 text-sm ${BTN_SOFT}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={adjustBalance}
                  className={`flex-1 rounded-2xl py-2.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
                >
                  Ajustar
                </button>
              </div>
            </div>
          )}

          {/* Borrar: escondido tras confirmación, nunca a un toque de distancia */}
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={`flex-1 rounded-2xl py-3 text-sm ${BTN_SOFT}`}
              >
                Mejor no
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={removeDebt}
                className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                Sí, borrar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mx-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
            >
              <TrashIcon className="h-4 w-4" /> Borrar esta deuda
            </button>
          )}
        </div>
      )}

      {/* ── Plan: tabla de amortización ── */}
      {tab === 'plan' && (
        <div className="flex flex-col gap-3">
          {debt.projection.neverPaysOff ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-5 text-center">
              <p className="text-3xl" aria-hidden="true">🛑</p>
              <p className="mt-2 text-sm font-bold text-blue-900">Con esta cuota no hay plan que valga</p>
              <p className="mt-1 text-xs text-blue-700">
                Sube a {fmtMoney(debt.projection.breakEven, debt.currency)} al mes y aquí aparecerá
                tu calendario
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-sky-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">Cuotas</p>
                  <p className="text-base font-extrabold text-black">{schedule.months ?? '—'}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">Interés total</p>
                  <p className="text-base font-extrabold text-black">
                    {fmtMoney(schedule.totalInterest, debt.currency, 0)}
                  </p>
                </div>
                <div className="rounded-2xl bg-sky-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">Libre el</p>
                  <p className="text-base font-extrabold text-black">
                    {fmtDateKey(debt.projection.payoffDate)}
                  </p>
                </div>
              </div>

              <p className="text-center text-xs text-slate-500">
                Pagarás {fmtMoney(schedule.totalPaid, debt.currency)} en total ·{' '}
                {fmtMonths(schedule.months)}
              </p>

              <div className="overflow-x-auto rounded-2xl ring-1 ring-sky-100">
                <table className="w-full min-w-[420px] text-right text-xs">
                  <thead className="bg-sky-50 text-[11px] text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">Cuota</th>
                      <th className="px-3 py-2.5 font-semibold">Pagas</th>
                      <th className="px-3 py-2.5 font-semibold">Interés</th>
                      <th className="px-3 py-2.5 font-semibold">Capital</th>
                      <th className="px-3 py-2.5 font-semibold">Te queda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-50">
                    {schedule.rows.map((r) => (
                      <tr key={r.month} className="bg-white">
                        <td className="px-3 py-2.5 text-left">
                          <span className="font-bold text-black">{r.month}</span>
                          <span className="ml-1.5 text-[10px] text-slate-400">
                            {fmtDateKey(r.date)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700">
                          {r.payment.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-blue-700">{r.interest.toFixed(2)}</td>
                        <td className="px-3 py-2.5 text-sky-600">{r.principal.toFixed(2)}</td>
                        <td className="px-3 py-2.5 font-bold text-black">
                          {r.closingBalance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {schedule.truncated && (
                <p className="text-center text-[11px] text-slate-400">
                  Mostrando las primeras {schedule.rows.length} de {schedule.months} cuotas
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Historial: el libro mayor ── */}
      {tab === 'ledger' && (
        <div className="flex flex-col gap-2">
          {movements === null && (
            <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
          )}
          {movements?.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Aún no hay movimientos en esta deuda
            </p>
          )}
          {movements?.map((m) => {
            const meta = MOVEMENT_META[m.kind] ?? MOVEMENT_META.adjustment;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 ring-1 ring-sky-100"
              >
                <span className="text-xl" aria-hidden="true">{meta.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-black">
                    {meta.label}
                    {m.kind === 'payment' && m.principalPart > 0 && (
                      <span className="ml-1.5 text-[11px] font-semibold text-sky-600">
                        −{fmtMoney(m.principalPart, debt.currency, 0)} de deuda
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {new Date(m.occurredAt).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {m.note && ` · ${m.note}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-extrabold text-black">
                  {meta.sign}
                  {fmtMoney(Math.abs(m.amount), debt.currency, 2)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeMovement(m.id)}
                  aria-label={`Deshacer ${meta.label}`}
                  className="shrink-0 rounded-full p-2 text-slate-300 transition hover:bg-sky-50 hover:text-slate-600 active:scale-90 disabled:opacity-40"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}
