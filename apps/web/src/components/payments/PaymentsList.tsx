'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { MonthlyPayment } from '@foody/types';
import { BanknotesIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/solid';
import PaymentCard from '@/components/payments/PaymentCard';
import NotificationsTestPanel from '@/components/payments/NotificationsTestPanel';

interface Props {
  readonly initialPayments: MonthlyPayment[];
}

type Filter = 'all' | 'pending' | 'paid';

export default function PaymentsList({ initialPayments }: Props) {
  const [payments, setPayments] = useState<MonthlyPayment[]>(initialPayments);
  const [filter, setFilter] = useState<Filter>('all');

  const toggleFilter = (f: Filter) => setFilter((prev) => (prev === f ? 'all' : f));

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleDeleted = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: MonthlyPayment) => {
    setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handlePaidToggle = useCallback((id: string, nowPaid: boolean) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isPaidThisMonth: nowPaid } : p)),
    );
  }, []);

  const handleSnoozed = useCallback((id: string, snoozedUntil: string) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, snoozedUntil } : p)),
    );
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────

  const now = new Date();
  const snoozed = payments.filter(
    (p) => !p.isPaidThisMonth && p.snoozedUntil != null && new Date(p.snoozedUntil) > now,
  );
  const snoozedIds = new Set(snoozed.map((p) => p.id));
  const pending = payments.filter((p) => !p.isPaidThisMonth && !snoozedIds.has(p.id));
  const paid = payments.filter((p) => p.isPaidThisMonth);
  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0);
  const totalSnoozed = snoozed.reduce((sum, p) => sum + p.amount, 0);

  // Use the most common currency, fallback to MXN
  const currencies = payments.map((p) => p.currency);
  const dominantCurrency = currencies.length > 0
    ? [...currencies].sort((a, b) => currencies.filter((c) => c === b).length - currencies.filter((c) => c === a).length)[0]
    : 'MXN';
  const mixedCurrencies = new Set(currencies).size > 1;

  function formatTotal(value: number): string {
    if (mixedCurrencies) return value.toFixed(2);
    try {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: dominantCurrency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${dominantCurrency} ${value.toFixed(2)}`;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">      {/* ─── Notifications test panel (collapsible) ─────────────────── */}
      <NotificationsTestPanel payments={payments} onSnoozed={handleSnoozed} />
      {/* ─── Monthly summary ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Total mensual — resets filter */}
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`flex flex-col items-center bg-white dark:bg-stone-900 border rounded-xl p-4 sm:p-6 shadow-sm active:scale-95 transition-all duration-200 min-w-0 focus:outline-none ${
            filter === 'all'
              ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/30 scale-[1.03]'
              : 'border-stone-100 dark:border-stone-800 hover:scale-105'
          }`}
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#4F46E5' }}
          >
            <BanknotesIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-stone-600 dark:text-stone-300 font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Total mensual
          </p>
          <p className="text-stone-800 dark:text-stone-100 text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            {formatTotal(totalExpenses)}{mixedCurrencies && <span className="text-xs text-stone-400 ml-1">*</span>}
          </p>
        </button>

        {/* Pagado */}
        <button
          type="button"
          onClick={() => toggleFilter('paid')}
          className={`flex flex-col items-center bg-white dark:bg-stone-900 border rounded-xl p-4 sm:p-6 shadow-sm active:scale-95 transition-all duration-200 min-w-0 focus:outline-none ${
            filter === 'paid'
              ? 'border-emerald-500 ring-2 ring-emerald-500/30 scale-[1.03]'
              : 'border-stone-100 dark:border-stone-800 hover:scale-105'
          }`}
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#10B981' }}
          >
            <CheckCircleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-stone-600 dark:text-stone-300 font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Pagado
          </p>
          <p className="text-stone-800 dark:text-stone-100 text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            {formatTotal(totalPaid)}{mixedCurrencies && <span className="text-xs text-stone-400 ml-1">*</span>}
          </p>
        </button>

        {/* Pendiente */}
        <button
          type="button"
          onClick={() => toggleFilter('pending')}
          className={`flex flex-col items-center bg-white dark:bg-stone-900 border rounded-xl p-4 sm:p-6 shadow-sm active:scale-95 transition-all duration-200 min-w-0 focus:outline-none ${
            filter === 'pending'
              ? 'border-amber-400 ring-2 ring-amber-400/30 scale-[1.03]'
              : 'border-stone-100 dark:border-stone-800 hover:scale-105'
          }`}
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#F59E0B' }}
          >
            <ClockIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-stone-600 dark:text-stone-300 font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Pendiente
          </p>
          <p className="text-stone-800 dark:text-stone-100 text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            {formatTotal(totalExpenses - totalPaid)}{mixedCurrencies && <span className="text-xs text-stone-400 ml-1">*</span>}
          </p>
          {totalSnoozed > 0 && (
            <p className="text-stone-400 dark:text-stone-500 text-[10px] sm:text-xs mt-1 text-center leading-tight">
              incl. {formatTotal(totalSnoozed)} pospuesto
            </p>
          )}
        </button>
      </div>

      {/* ─── Pending payments ─────────────────────────────────────────────── */}
      {pending.length > 0 && filter !== 'paid' && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">
            ⏰ Pendientes ({pending.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pending.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onPaidToggle={handlePaidToggle}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Snoozed payments ─────────────────────────────────────────────── */}
      {snoozed.length > 0 && filter !== 'paid' && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">
            ⏸ Pospuestos ({snoozed.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {snoozed.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onPaidToggle={handlePaidToggle}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Paid this month ──────────────────────────────────────────────── */}
      {paid.length > 0 && filter !== 'pending' && (
        <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
          <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 mb-4">
            ✅ Pagados este mes ({paid.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {paid.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onPaidToggle={handlePaidToggle}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Empty state ──────────────────────────────────────────────────── */}
      {payments.length === 0 && (
        <div className="text-center py-20">
          <p className="text-6xl mb-4">💸</p>
          <h2 className="text-xl font-semibold text-stone-600 mb-2">
            Sin pagos registrados
          </h2>
          <Link
            href="/payments/new"
            className="inline-block bg-brand-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-600 transition mt-4"
          >
            Agregar primer pago
          </Link>
        </div>
      )}
    </div>
  );
}
