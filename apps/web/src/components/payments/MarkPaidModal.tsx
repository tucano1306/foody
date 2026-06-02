'use client';

import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { MonthlyPayment, PaymentMethod } from '@foody/types';

interface Props {
  readonly payment: MonthlyPayment;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirmed: () => void;
  /** Recently used bank accounts for quick-pick suggestions */
  readonly recentBankAccounts?: readonly string[];
}

interface MethodOption {
  readonly value: PaymentMethod;
  readonly icon: string;
  readonly label: string;
  readonly hint: string;
}

const METHODS: readonly MethodOption[] = [
  { value: 'transfer',     icon: '🔁', label: 'Transferencia',  hint: 'SPEI, PSE, ACH…' },
  { value: 'debit_card',   icon: '💳', label: 'T. Débito',       hint: 'Cobro inmediato' },
  { value: 'credit_card',  icon: '💳', label: 'T. Crédito',      hint: 'Pago mensual' },
  { value: 'bank_account', icon: '🏦', label: 'Cuenta bancaria', hint: 'Cargo directo' },
  { value: 'cash',         icon: '💵', label: 'Efectivo',        hint: 'Ventanilla' },
  { value: 'other',        icon: '➕', label: 'Otro',             hint: '' },
];

export default function MarkPaidModal({ payment, open, onClose, onConfirmed, recentBankAccounts = [] }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [bankAccount, setBankAccount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setAmount(payment.isVariableAmount ? '' : payment.amount.toFixed(2));
      setMethod(null);
      setBankAccount('');
      setNotes('');
      setError(null);
    }
    if (!open && el.open) el.close();
  }, [open, payment.isVariableAmount, payment.amount]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open, onClose]);

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido');
      return;
    }
    if (!method) {
      setError('Selecciona cómo pagaste');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: parsedAmount,
          paymentMethod: method,
          bankAccount: bankAccount.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo registrar el pago');
      }
      onConfirmed();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const needsBank = method === 'transfer' || method === 'debit_card' || method === 'credit_card' || method === 'bank_account';

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none">
        <section className="pointer-events-auto w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-fade-up overflow-y-auto max-h-[92dvh]">
          <form onSubmit={submit} className="p-5 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-xl">✓</div>
                <div>
                  <h2 className="text-stone-900 dark:text-white font-bold text-base leading-tight">Registrar pago</h2>
                  <p className="text-stone-500 dark:text-gray-400 text-xs truncate max-w-50">{payment.name}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-gray-400 hover:bg-stone-200 dark:hover:bg-white/20 transition"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="px-3 py-2 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 rounded-xl text-rose-700 dark:text-rose-300 text-sm">
                {error}
              </div>
            )}

            {/* Amount */}
            <div>
              <label htmlFor="mark-paid-amount" className="block text-xs font-semibold text-stone-600 dark:text-gray-300 mb-1.5">
                Monto pagado <span className="text-brand-500">*</span>
                {payment.isVariableAmount && (
                  <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    ⚡ Variable
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-gray-500 font-medium select-none">
                  {payment.currency}
                </span>
                <input
                  id="mark-paid-amount"
                  required
                  autoFocus={payment.isVariableAmount}
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={payment.isVariableAmount ? 'Ej: 87.50' : payment.amount.toFixed(2)}
                  className="w-full pl-14 pr-4 py-3 rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-stone-900 dark:text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
                />
              </div>
              {payment.isVariableAmount && (
                <p className="text-[11px] text-stone-500 dark:text-gray-400 mt-1.5">
                  💡 Este pago es por consumo. Ingresa el monto exacto que aparece en el recibo.
                </p>
              )}
            </div>

            {/* Method chips */}
            <fieldset>
              <legend className="block text-xs font-semibold text-stone-600 dark:text-gray-300 mb-2">
                ¿Cómo pagaste? <span className="text-brand-500">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => {
                  const selected = method === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      aria-pressed={selected}
                      className={`flex flex-col items-start gap-0.5 px-3 py-3 rounded-2xl border text-left transition active:scale-95 ${
                        selected
                          ? 'bg-brand-500 border-brand-500 text-white shadow-md'
                          : 'bg-white dark:bg-white/5 border-stone-200 dark:border-white/10 text-stone-700 dark:text-gray-200 hover:border-brand-300 dark:hover:border-brand-500/50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                      </span>
                      {m.hint && (
                        <span className={`text-[10px] ${selected ? 'text-white/80' : 'text-stone-400 dark:text-gray-500'}`}>
                          {m.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Bank / account */}
            {needsBank && (
              <div>
                <label htmlFor="mark-paid-bank" className="block text-xs font-semibold text-stone-600 dark:text-gray-300 mb-1.5">
                  Banco o cuenta {needsBank && <span className="text-stone-400 dark:text-gray-500 font-normal">(opcional)</span>}
                </label>
                <input
                  id="mark-paid-bank"
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  list="recent-bank-accounts"
                  placeholder="Ej: Bancolombia •••1234"
                  maxLength={100}
                  className="w-full px-4 py-3 rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm"
                />
                {recentBankAccounts.length > 0 && (
                  <>
                    <datalist id="recent-bank-accounts">
                      {recentBankAccounts.map((acc) => (
                        <option key={acc} value={acc} />
                      ))}
                    </datalist>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {recentBankAccounts.slice(0, 4).map((acc) => (
                        <button
                          key={acc}
                          type="button"
                          onClick={() => setBankAccount(acc)}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 dark:bg-white/10 text-stone-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-white/20 transition"
                        >
                          {acc}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="mark-paid-notes" className="block text-xs font-semibold text-stone-600 dark:text-gray-300 mb-1.5">
                Nota <span className="text-stone-400 dark:text-gray-500 font-normal">(opcional)</span>
              </label>
              <textarea
                id="mark-paid-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ej: Folio 123456"
                className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl bg-stone-100 dark:bg-white/10 text-stone-700 dark:text-gray-200 font-semibold text-sm hover:bg-stone-200 dark:hover:bg-white/20 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition disabled:opacity-50"
              >
                {saving ? 'Guardando…' : '✓ Confirmar pago'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </dialog>
  );
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { icon: string; label: string }> = {
  transfer:     { icon: '🔁', label: 'Transferencia' },
  debit_card:   { icon: '💳', label: 'Tarjeta de débito' },
  credit_card:  { icon: '💳', label: 'Tarjeta de crédito' },
  bank_account: { icon: '🏦', label: 'Cuenta bancaria' },
  cash:         { icon: '💵', label: 'Efectivo' },
  other:        { icon: '➕', label: 'Otro' },
};
