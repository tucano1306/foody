'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { MonthlyPayment } from '@foody/types';
import { BanknotesIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/solid';
import PaymentCard from '@/components/payments/PaymentCard';

interface Props {
  readonly initialPayments: MonthlyPayment[];
}

export default function PaymentsList({ initialPayments }: Props) {
  const [payments, setPayments] = useState<MonthlyPayment[]>(initialPayments);

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

  // ── Derived values ───────────────────────────────────────────────────────

  const pending = payments.filter((p) => !p.isPaidThisMonth);
  const paid = payments.filter((p) => p.isPaidThisMonth);
  const totalExpenses = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paid.reduce((sum, p) => sum + p.amount, 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Monthly summary ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center bg-gray-900 rounded-xl p-4 sm:p-6 shadow-lg hover:scale-105 transition-transform duration-300 min-w-0">
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#4F46E5' }}
          >
            <BanknotesIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-white font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Total mensual
          </p>
          <p className="text-white text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            ${totalExpenses.toFixed(2)}
          </p>
        </div>

        <div className="flex flex-col items-center bg-gray-900 rounded-xl p-4 sm:p-6 shadow-lg hover:scale-105 transition-transform duration-300 min-w-0">
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#10B981' }}
          >
            <CheckCircleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-white font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Pagado
          </p>
          <p className="text-white text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            ${totalPaid.toFixed(2)}
          </p>
        </div>

        <div className="flex flex-col items-center bg-gray-900 rounded-xl p-4 sm:p-6 shadow-lg hover:scale-105 transition-transform duration-300 min-w-0">
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#F59E0B' }}
          >
            <ClockIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-white font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Pendiente
          </p>
          <p className="text-white text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            ${(totalExpenses - totalPaid).toFixed(2)}
          </p>
        </div>
      </div>

      {/* ─── Pending payments ─────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <section className="bg-gray-900 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">
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
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Paid this month ──────────────────────────────────────────────── */}
      {paid.length > 0 && (
        <section className="bg-gray-900 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-white mb-4">
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
