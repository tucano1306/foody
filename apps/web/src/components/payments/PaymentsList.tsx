'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { MonthlyPayment } from '@foody/types';
import { BanknotesIcon, CheckCircleIcon, ChevronDownIcon, ClockIcon } from '@heroicons/react/24/solid';
import PaymentCard from '@/components/payments/PaymentCard';

interface Props {
  readonly initialPayments: MonthlyPayment[];
}

type Filter = 'all' | 'pending' | 'paid';

/** Atajos de la lista vacía: tocar la categoría ES la instrucción. */
const PAYMENT_SHORTCUTS: readonly { category: string; emoji: string; label: string }[] = [
  { category: 'rent', emoji: '🏠', label: 'Renta' },
  { category: 'utilities', emoji: '💡', label: 'Servicios' },
  { category: 'internet', emoji: '🌐', label: 'Internet' },
  { category: 'phone', emoji: '📞', label: 'Teléfono' },
  { category: 'streaming', emoji: '🎬', label: 'Streaming' },
  { category: 'other', emoji: '💰', label: 'Otro' },
];

const CATEGORY_ICONS: Record<string, string> = {
  utilities: '💡',
  subscriptions: '📱',
  rent: '🏠',
  insurance: '🛡️',
  internet: '🌐',
  phone: '📞',
  streaming: '🎬',
  other: '💰',
};

export default function PaymentsList({ initialPayments }: Props) {
  const [payments, setPayments] = useState<MonthlyPayment[]>(initialPayments);
  const [filter, setFilter] = useState<Filter>('all');
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('payment');

  // Jump from a history row to that payment's card: reset the filter so the
  // card is rendered, then let ?payment= trigger its scroll + auto-open.
  const goToPayment = useCallback((id: string) => {
    setFilter('all');
    router.push(`/payments?payment=${id}`, { scroll: false });
  }, [router]);

  const toggleFilter = (f: Filter) => setFilter((prev) => (prev === f ? 'all' : f));

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleDeleted = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: MonthlyPayment) => {
    setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
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
  // Total accumulated debt across ALL payments with missed months
  const totalAccumulated = payments.reduce((sum, p) => sum + (p.accumulatedDebt ?? 0), 0);
  // All-time paid totals (running history across every payment)
  const totalPaidAllTime = payments.reduce((sum, p) => sum + (p.totalPaidAllTime ?? 0), 0);
  const paidCountAllTime = payments.reduce((sum, p) => sum + (p.paidCountAllTime ?? 0), 0);
  const paidBreakdown = payments
    .filter((p) => (p.totalPaidAllTime ?? 0) > 0)
    .sort((a, b) => (b.totalPaidAllTime ?? 0) - (a.totalPaidAllTime ?? 0));

  // Use the most common currency, fallback to USD
  const currencies = payments.map((p) => p.currency);
  const dominantCurrency = currencies.length > 0
    ? [...currencies].sort((a, b) => currencies.filter((c) => c === b).length - currencies.filter((c) => c === a).length)[0]
    : 'USD';
  const mixedCurrencies = new Set(currencies).size > 1;

  function formatTotal(value: number): string {
    if (mixedCurrencies) return value.toFixed(2);
    try {
      return new Intl.NumberFormat('en-US', {
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
    <div className="space-y-6">
      {/* ─── Accumulated debt alert ──────────────────────────────────────── */}
      {totalAccumulated > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
          <span className="text-2xl shrink-0">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-700">
              Ya llevas {formatTotal(totalAccumulated)} acumulado
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              Meses vencidos sin pagar — cada pago que registres abona al mes más antiguo.
            </p>
          </div>
        </div>
      )}

      {/* ─── Monthly summary ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Total mensual — resets filter */}
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`flex flex-col items-center bg-white border rounded-xl p-4 sm:p-6 shadow-sm active:scale-95 transition-all duration-200 min-w-0 focus:outline-none ${
            filter === 'all'
              ? 'border-[#0ea5e9] ring-2 ring-[#0ea5e9]/30 scale-[1.03]'
              : 'border-sky-100 hover:scale-105'
          }`}
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#0ea5e9' }}
          >
            <BanknotesIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-slate-600 font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Total mensual
          </p>
          <p className="text-black text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            {formatTotal(totalExpenses)}{mixedCurrencies && <span className="text-xs text-slate-400 ml-1">*</span>}
          </p>
        </button>

        {/* Pagado */}
        <button
          type="button"
          onClick={() => toggleFilter('paid')}
          className={`flex flex-col items-center bg-white border rounded-xl p-4 sm:p-6 shadow-sm active:scale-95 transition-all duration-200 min-w-0 focus:outline-none ${
            filter === 'paid'
              ? 'border-sky-500 ring-2 ring-sky-500/30 scale-[1.03]'
              : 'border-sky-100 hover:scale-105'
          }`}
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#38bdf8' }}
          >
            <CheckCircleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-slate-600 font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Pagado
          </p>
          <p className="text-black text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            {formatTotal(totalPaid)}{mixedCurrencies && <span className="text-xs text-slate-400 ml-1">*</span>}
          </p>
        </button>

        {/* Pendiente */}
        <button
          type="button"
          onClick={() => toggleFilter('pending')}
          className={`flex flex-col items-center bg-white border rounded-xl p-4 sm:p-6 shadow-sm active:scale-95 transition-all duration-200 min-w-0 focus:outline-none ${
            filter === 'pending'
              ? 'border-sky-400 ring-2 ring-sky-400/30 scale-[1.03]'
              : 'border-sky-100 hover:scale-105'
          }`}
        >
          <div
            className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: '#3b82f6' }}
          >
            <ClockIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <p className="text-slate-600 font-semibold text-[11px] sm:text-sm text-center leading-tight">
            Pendiente
          </p>
          <p className="text-black text-base sm:text-2xl font-bold mt-1 break-all text-center leading-tight">
            {formatTotal(totalExpenses - totalPaid)}{mixedCurrencies && <span className="text-xs text-slate-400 ml-1">*</span>}
          </p>
          {totalSnoozed > 0 && (
            <p className="text-slate-400 text-[10px] sm:text-xs mt-1 text-center leading-tight">
              incl. {formatTotal(totalSnoozed)} pospuesto
            </p>
          )}
        </button>
      </div>

      {/* ─── All-time paid history ────────────────────────────────────────── */}
      {payments.length > 0 && (
        <section className="rounded-2xl overflow-hidden shadow-sm bg-linear-to-br from-sky-600 to-blue-700">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="w-full flex items-center gap-3 px-4 py-4 sm:px-5 text-left active:scale-[0.99] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0" aria-hidden="true">
              💰
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm sm:text-base leading-tight">Pagado a la fecha</p>
              <p className="text-white/70 text-[11px] sm:text-xs mt-0.5">
                {paidCountAllTime === 0
                  ? 'Aún sin pagos registrados'
                  : `${paidCountAllTime} ${paidCountAllTime === 1 ? 'pago registrado' : 'pagos registrados'} en total`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="text-white text-lg sm:text-2xl font-extrabold">
                {formatTotal(totalPaidAllTime)}{mixedCurrencies && <span className="text-xs text-white/60 ml-1">*</span>}
              </p>
              <ChevronDownIcon className={`w-4 h-4 text-white/80 transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          {historyOpen && (
            <div className="px-4 pb-4 sm:px-5 flex flex-col gap-1.5 animate-fade-up">
              {paidBreakdown.length === 0 ? (
                <p className="text-white/80 text-xs bg-white/10 rounded-xl px-3 py-2.5">
                  Cuando marques pagos como pagados, aquí verás cuánto llevas abonado a cada uno.
                </p>
              ) : (
                paidBreakdown.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => goToPayment(p.id)}
                    aria-label={`Ver el pago ${p.name}`}
                    className="w-full flex items-center justify-between gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <span className="text-white/90 text-xs font-semibold truncate">
                      <span aria-hidden="true" className="mr-1.5">{CATEGORY_ICONS[p.category ?? 'other'] ?? '💰'}</span>
                      {p.name}
                    </span>
                    <span className="text-white text-xs font-bold shrink-0 flex items-center gap-1.5">
                      <span>
                        {p.currency} {(p.totalPaidAllTime ?? 0).toFixed(2)}
                        <span className="text-white/60 font-medium">
                          {' '}· {p.paidCountAllTime ?? 0} {(p.paidCountAllTime ?? 0) === 1 ? 'pago' : 'pagos'}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-white/60">›</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── Pending payments ─────────────────────────────────────────────── */}
      {pending.length > 0 && filter !== 'paid' && (
        <section className="bg-sky-50/70 rounded-2xl p-5 border-2 border-sky-200/80 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              ⏰
            </span>
            <h2 className="text-lg font-bold text-sky-900">Pendientes</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-200/80 text-sky-800">
              {pending.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {pending.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Snoozed payments ─────────────────────────────────────────────── */}
      {snoozed.length > 0 && filter !== 'paid' && (
        <section className="bg-sky-50/70/80 rounded-2xl p-5 border-2 border-sky-200/80 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-slate-200/70 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              ⏸
            </span>
            <h2 className="text-lg font-bold text-slate-700">Pospuestos</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-600">
              {snoozed.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {snoozed.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Paid this month ──────────────────────────────────────────────── */}
      {paid.length > 0 && filter !== 'pending' && (
        <section className="bg-sky-50/70 rounded-2xl p-5 border-2 border-sky-200/80 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
              ✅
            </span>
            <h2 className="text-lg font-bold text-sky-900">Pagados este mes</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-200/80 text-sky-800">
              {paid.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card-stagger">
            {paid.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                autoOpen={payment.id === highlightId}
                onDeleted={handleDeleted}
                onUpdated={handleUpdated}
                onSnoozed={handleSnoozed}
              />
            ))}
          </div>
        </section>
      )}

      {/* ─── Empty state ──────────────────────────────────────────────────── */}
      {/* Sin instrucciones: tocar la categoría abre el formulario ya encaminado. */}
      {payments.length === 0 && (
        <div className="grid grid-cols-3 gap-3 py-6">
          {PAYMENT_SHORTCUTS.map(({ category, emoji, label }) => (
            <Link
              key={category}
              href={`/payments/new?category=${category}`}
              className="flex flex-col items-center justify-center gap-2 aspect-square rounded-3xl bg-white border border-sky-100 shadow-sm active:scale-95 active:shadow-inner transition"
            >
              <span className="text-3xl leading-none" aria-hidden="true">{emoji}</span>
              <span className="text-xs font-bold text-black">{label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
