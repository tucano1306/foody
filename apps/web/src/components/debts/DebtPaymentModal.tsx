'use client';

import { useMemo, useState } from 'react';
import type { PaymentMethod } from '@foody/types';
import type { DebtWithProjection } from '@/lib/debt-data';
import { allocatePayment, minimumPayment } from '@/lib/debt-engine';
import { PAYMENT_METHODS } from '@/lib/payment-methods';
import { confettiRain } from '@/lib/fx';
import { playSound } from '@/lib/sound';
import { haptic } from '@/lib/haptic';
import ModalShell from '@/components/finance/ModalShell';
import SplitBar from './SplitBar';
import { BTN_PRIMARY, BTN_SOFT, fmtMoney } from './debt-ui';
import { parseMoney } from '@/lib/money-input';

interface Props {
  readonly debt: DebtWithProjection;
  readonly onClose: () => void;
  readonly onPaid: (debt: DebtWithProjection) => void;
}

interface QuickAmount {
  id: string;
  label: string;
  emoji: string;
  value: number;
  /** Avisa cuando el atajo NO baja la deuda. */
  warns?: boolean;
}

/**
 * Registrar un abono.
 *
 * Todo el modal gira alrededor de una pregunta que el usuario nunca se hace
 * explícitamente pero siempre le importa: *de lo que estoy pagando, ¿cuánto baja
 * mi deuda?*. La barra se recalcula con cada tecla, así que la respuesta llega
 * antes de confirmar, no después.
 */
export default function DebtPaymentModal({ debt, onClose, onPaid }: Props) {
  const [amount, setAmount] = useState<string>(
    debt.projection.installment > 0 ? debt.projection.installment.toFixed(2) : '',
  );
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseMoney(amount);
  const value = parsed !== null && parsed > 0 ? parsed : 0;

  // Mismo reparto que aplicará el servidor: cascada comisiones → interés → capital.
  const split = useMemo(
    () =>
      allocatePayment({
        balance: debt.breakdown.principalOwed,
        accruedInterest: debt.breakdown.interestOwed,
        pendingFees: debt.breakdown.feesOwed,
        payment: value,
      }),
    [debt.breakdown, value],
  );

  const quickAmounts = useMemo<QuickAmount[]>(() => {
    const owed = debt.breakdown.interestOwed + debt.breakdown.feesOwed;
    const min = minimumPayment(
      debt.currentBalance,
      debt.projection.monthlyRate,
      debt.minPercent ?? undefined,
      debt.minFloor ?? 0,
    );
    return [
      { id: 'installment', label: 'Tu cuota', emoji: '📆', value: debt.projection.installment },
      { id: 'minimum', label: 'Mínimo', emoji: '🪙', value: min },
      { id: 'interest', label: 'Solo interés', emoji: '♾️', value: owed, warns: true },
      { id: 'all', label: 'Todo', emoji: '🎉', value: debt.currentBalance },
    ].filter((q) => q.value > 0);
  }, [debt]);

  // Un abono que no toca capital es la trampa entera de esta sección: se avisa
  // antes de confirmar, no en una nota al pie después.
  const doesNotAmortize = value > 0 && !split.touchedPrincipal;
  const nothingOwedYet = debt.breakdown.interestOwed + debt.breakdown.feesOwed === 0;

  async function submit() {
    if (value <= 0) {
      setError('Escribe cuánto vas a abonar');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/debts/${debt.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: value, paymentMethod: method, note: note.trim() || null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo registrar el abono');
      }
      const data = (await res.json()) as { debt: DebtWithProjection };
      haptic([12, 30, 12]);
      playSound('payment');
      confettiRain(data.debt.currentBalance <= 0 ? ['🎉', '🥳', '✨'] : ['💸', '✨']);
      onPaid(data.debt);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Abonar"
      subtitle={`${debt.name} · debes ${fmtMoney(debt.currentBalance, debt.currency)}`}
      emoji="💸"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || value <= 0}
            className={`flex-[2] rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
          >
            {saving ? 'Guardando…' : `Abonar ${fmtMoney(value, debt.currency)}`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <p className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
            {error}
          </p>
        )}

        {/* Monto: el campo manda, grande y directo al pulgar */}
        <div>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
              {debt.currency}
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

          {/* Atajos: tocar uno ES la instrucción */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {quickAmounts.map((q) => {
              const selected = Math.abs(value - q.value) < 0.005;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    haptic();
                    setAmount(q.value.toFixed(2));
                  }}
                  aria-pressed={selected}
                  className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 text-left transition-all duration-150 active:scale-95 ${
                    selected
                      ? 'border-sky-500 bg-sky-500 text-white shadow-md'
                      : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300'
                  }`}
                >
                  <span className="text-xs font-bold">
                    <span aria-hidden="true">{q.emoji}</span> {q.label}
                  </span>
                  <span className="text-xs font-extrabold">
                    {fmtMoney(q.value, debt.currency, 0)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* El reparto en vivo */}
        {value > 0 && (
          <div className="rounded-3xl bg-sky-50/80 p-4">
            <p className="mb-3 text-xs font-bold text-slate-600">Este abono se reparte así</p>
            <SplitBar
              interest={split.fees + split.interest}
              principal={split.principal}
              currency={debt.currency}
            />

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-sky-200/70 pt-3">
              <span className="text-xs font-semibold text-slate-600">Te quedarías debiendo</span>
              <span className="text-lg font-extrabold text-black">
                {fmtMoney(split.remainingBalance, debt.currency)}
              </span>
            </div>

            {split.overpayment > 0 && (
              <p className="mt-2 rounded-xl bg-sky-100 px-3 py-2 text-[11px] font-semibold text-sky-800">
                🎉 Te sobran {fmtMoney(split.overpayment, debt.currency)} — con este abono la
                liquidas completa
              </p>
            )}

            {doesNotAmortize && (
              <p className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800">
                🛑 Con este monto tu deuda no baja: se va entero en intereses
              </p>
            )}

            {nothingOwedYet && split.principal > 0 && (
              <p className="mt-2 rounded-xl bg-sky-100 px-3 py-2 text-[11px] font-semibold text-sky-800">
                ✨ Aún no hay intereses pendientes: todo este abono baja tu deuda
              </p>
            )}
          </div>
        )}

        {/* Cómo pagó */}
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
                  <span className="text-[10px] font-bold leading-tight">{m.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Nota (opcional)"
          aria-label="Nota"
          className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-black placeholder-slate-400 transition focus:border-sky-400 focus:outline-none"
        />
      </div>
    </ModalShell>
  );
}
