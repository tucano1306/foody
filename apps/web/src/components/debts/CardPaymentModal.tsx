'use client';

import { useMemo, useState } from 'react';
import type { PaymentMethod } from '@foody/types';
import type { DebtWithProjection } from '@/lib/debt-data';
import { allocateCardPayment, cardTitle, estimateCardMinimum, type CardTramo } from '@/lib/card-payment';
import { toDateKey } from '@/lib/debt-engine';
import { PAYMENT_METHODS } from '@/lib/payment-methods';
import { confettiRain } from '@/lib/fx';
import { playSound } from '@/lib/sound';
import { haptic } from '@/lib/haptic';
import { parseMoney } from '@/lib/money-input';
import ModalShell from '@/components/finance/ModalShell';
import { BTN_PRIMARY, BTN_SOFT, fmtMoney } from './debt-ui';

interface Props {
  /** Los tramos de la tarjeta con sus saldos ENTEROS, sin filtrar por ámbito. */
  readonly tramos: readonly DebtWithProjection[];
  readonly onClose: () => void;
  readonly onPaid: (debts: readonly DebtWithProjection[]) => void;
}

function aTramo(d: DebtWithProjection): CardTramo {
  return {
    id: d.id,
    name: d.name,
    balance: d.currentBalance,
    rate: d.rate,
    ratePeriod: d.ratePeriod,
    promoEndsOn: d.promoEndsOn,
    rateAfterPromo: d.rateAfterPromo,
  };
}

const pct = (mensual: number) => `${(mensual * 1200).toFixed(2).replace(/\.?0+$/, '')} %`;

/**
 * Abonar a una tarjeta con tramos.
 *
 * La pregunta que no tenía respuesta: «pagué $156, ¿a cuál de los saldos le
 * cayó?». Aquí se ve antes de confirmar, tramo por tramo, con la misma regla
 * que aplica el banco: el mínimo a la tasa más baja, lo que pasa del mínimo a
 * la más alta. El servidor lo vuelve a calcular con la misma función.
 */
export default function CardPaymentModal({ tramos, onClose, onPaid }: Props) {
  const currency = tramos[0]?.currency ?? 'USD';
  const total = tramos.reduce((s, t) => s + t.currentBalance, 0);

  const minimoPropuesto = useMemo(
    () =>
      estimateCardMinimum(
        tramos.map((t) => ({
          principal: t.breakdown.principalOwed,
          interest: t.breakdown.interestOwed,
          fees: t.breakdown.feesOwed,
        })),
      ),
    [tramos],
  );

  const [amount, setAmount] = useState(minimoPropuesto > 0 ? minimoPropuesto.toFixed(2) : '');
  const [minimum, setMinimum] = useState(minimoPropuesto > 0 ? minimoPropuesto.toFixed(2) : '');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monto = Math.max(0, parseMoney(amount) ?? 0);
  const minimo = Math.max(0, parseMoney(minimum) ?? 0);

  const reparto = useMemo(
    () => allocateCardPayment({ tramos: tramos.map(aTramo), amount: monto, minimumDue: minimo, hoy: toDateKey(new Date()) }),
    [tramos, monto, minimo],
  );

  // El tramo caro que se queda sin tocar: es el aviso que da sentido a todo esto.
  const caroSinTocar = useMemo(() => {
    const hoy = toDateKey(new Date());
    const conInteres = allocateCardPayment({ tramos: tramos.map(aTramo), amount: total, minimumDue: 0, hoy }).parts[0];
    if (!conInteres || conInteres.monthlyRate <= 0) return null;
    return reparto.parts.some((p) => p.tramoId === conInteres.tramoId) ? null : conInteres;
  }, [tramos, total, reparto]);

  async function submit() {
    if (monto <= 0) {
      setError('Escribe cuánto vas a abonar');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const group = tramos[0]?.cardGroup;
      const res = await fetch(`/api/debts/cards/${group}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: monto, minimumDue: minimo, paymentMethod: method }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; debts?: DebtWithProjection[] };
      if (!res.ok || !data.debts) throw new Error(data.message ?? 'No se pudo registrar el abono');
      // Primero lo que importa: el abono YA está asentado, y la lista tiene que
      // enseñarlo aunque la celebración falle (un navegador sin `animate`).
      onPaid(data.debts);
      onClose();
      try {
        haptic([12, 30, 12]);
        playSound('payment');
        confettiRain(['💸', '✨']);
      } catch {
        // Solo adorno.
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Abonar a la tarjeta"
      subtitle={`${cardTitle(tramos)} · debes ${fmtMoney(total, currency)}`}
      emoji="💳"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || monto <= 0 || reparto.overpayment > 0}
            className={`flex-[2] rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
          >
            {saving ? 'Guardando…' : `Abonar ${fmtMoney(monto, currency)}`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <p className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">{error}</p>
        )}

        <div>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
              {currency}
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Monto a abonar"
              className="w-full rounded-3xl border-2 border-sky-200 bg-white py-5 pl-16 pr-4 text-right text-3xl font-extrabold text-black transition focus:border-sky-400 focus:outline-none"
            />
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-2.5">
            <span className="text-xs font-bold text-slate-600">Mínimo del estado de cuenta</span>
            <input
              type="text"
              inputMode="decimal"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
              aria-label="Pago mínimo del estado de cuenta"
              className="w-28 bg-transparent text-right text-base font-extrabold text-black focus:outline-none"
            />
          </label>
        </div>

        {monto > 0 && (
          <div className="rounded-3xl bg-sky-50/80 p-4">
            <p className="mb-3 text-xs font-bold text-slate-600">Así lo reparte el banco</p>
            <ul className="flex flex-col gap-2.5" aria-label="Reparto del abono">
              {reparto.parts.map((p) => (
                <li key={p.tramoId} className="rounded-2xl bg-white px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-black">{p.name}</span>
                    <span className="shrink-0 text-base font-extrabold text-black">{fmtMoney(p.amount, currency)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                    {p.fromMinimum > 0 && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
                        🪙 {fmtMoney(p.fromMinimum, currency)} del mínimo
                      </span>
                    )}
                    {p.fromExcess > 0 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">
                        ➕ {fmtMoney(p.fromExcess, currency)} de más
                      </span>
                    )}
                    <span>{p.monthlyRate > 0 ? pct(p.monthlyRate) : '0 %'}</span>
                    <span className="text-slate-300">·</span>
                    <span>quedan {fmtMoney(p.balanceAfter, currency)}</span>
                  </div>
                </li>
              ))}
            </ul>

            {caroSinTocar && (
              <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800">
                🛑 {caroSinTocar.name} ({pct(caroSinTocar.monthlyRate)}) no baja: solo recibe lo que pagues por encima del mínimo
              </p>
            )}
            {reparto.overpayment > 0 && (
              <p className="mt-3 rounded-xl bg-sky-100 px-3 py-2 text-[11px] font-semibold text-sky-800">
                Es más de lo que debe la tarjeta: sobran {fmtMoney(reparto.overpayment, currency)}
              </p>
            )}
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-xs font-bold text-slate-600">¿Cómo pagaste?</legend>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => {
              const selected = method === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    haptic();
                    setMethod(selected ? null : m.value);
                  }}
                  aria-pressed={selected}
                  className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-all duration-150 active:scale-95 ${
                    selected
                      ? 'border-sky-500 bg-sky-500 text-white shadow-md'
                      : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300'
                  }`}
                >
                  <span className="text-lg" aria-hidden="true">{m.icon}</span>
                  <span className="text-[11px] font-bold leading-tight">{m.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </ModalShell>
  );
}
