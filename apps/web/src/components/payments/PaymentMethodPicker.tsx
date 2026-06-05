'use client';

import type { PaymentMethod } from '@foody/types';
import { PAYMENT_METHODS, bankFieldLabel, isCardMethod, methodNeedsBank, toLast4 } from '@/lib/payment-methods';

type Variant = 'light' | 'dark';

interface Props {
  readonly method: PaymentMethod | null;
  readonly bankName: string;
  readonly accountLast4: string;
  readonly onMethodChange: (method: PaymentMethod) => void;
  readonly onBankNameChange: (value: string) => void;
  readonly onAccountLast4Change: (value: string) => void;
  /** Unique prefix so multiple pickers on a page keep distinct input ids */
  readonly idPrefix: string;
  readonly variant?: Variant;
}

function chipClass(selected: boolean, variant: Variant): string {
  if (selected) return 'bg-brand-500 border-brand-500 text-white shadow-md';
  if (variant === 'dark') {
    return 'bg-white/5 border-white/10 text-gray-200 hover:border-brand-500/50';
  }
  return 'bg-white border-stone-200 text-stone-700 hover:border-brand-300 hover:bg-brand-50';
}

function hintClass(selected: boolean, variant: Variant): string {
  if (selected) return 'text-white/80';
  return variant === 'dark' ? 'text-gray-500' : 'text-stone-400';
}

function inputClass(variant: Variant): string {
  if (variant === 'dark') {
    return 'w-full px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm';
  }
  return 'w-full px-4 py-3 rounded-2xl border border-stone-200 bg-white text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition text-sm';
}

function labelClass(variant: Variant): string {
  return variant === 'dark'
    ? 'block text-xs font-semibold text-gray-300 mb-1.5'
    : 'block text-xs font-semibold text-stone-600 mb-1.5';
}

export default function PaymentMethodPicker({
  method,
  bankName,
  accountLast4,
  onMethodChange,
  onBankNameChange,
  onAccountLast4Change,
  idPrefix,
  variant = 'light',
}: Props) {
  const needsBank = methodNeedsBank(method);
  const card = isCardMethod(method);
  const mutedNote = variant === 'dark' ? 'text-gray-500' : 'text-stone-400';

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const selected = method === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onMethodChange(m.value)}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-2xl border text-left transition active:scale-95 ${chipClass(selected, variant)}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span aria-hidden="true">{m.icon}</span>
                <span>{m.shortLabel}</span>
              </span>
              {m.hint && <span className={`text-[10px] ${hintClass(selected, variant)}`}>{m.hint}</span>}
            </button>
          );
        })}
      </div>

      {needsBank && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor={`${idPrefix}-bank`} className={labelClass(variant)}>
                {bankFieldLabel(method)}
              </label>
              <input
                id={`${idPrefix}-bank`}
                type="text"
                value={bankName}
                onChange={(e) => onBankNameChange(e.target.value)}
                placeholder={card ? 'Ej: Visa Nu' : 'Ej: Bancolombia'}
                maxLength={50}
                className={inputClass(variant)}
              />
            </div>
            <div className="min-w-28">
              <label htmlFor={`${idPrefix}-last4`} className={labelClass(variant)}>
                Últimos 4 dígitos
              </label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono select-none ${mutedNote}`}
                >
                  ••••
                </span>
                <input
                  id={`${idPrefix}-last4`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountLast4}
                  onChange={(e) => onAccountLast4Change(toLast4(e.target.value))}
                  placeholder="1234"
                  maxLength={4}
                  className={`${inputClass(variant)} pl-12 font-mono tracking-widest`}
                />
              </div>
            </div>
          </div>
          <p className={`text-[11px] flex items-start gap-1.5 ${variant === 'dark' ? 'text-amber-300' : 'text-amber-600'}`}>
            <span aria-hidden="true">🔒</span>
            <span>
              Por seguridad solo guardamos los <strong>últimos 4 dígitos</strong>. Nunca ingreses el número completo.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
