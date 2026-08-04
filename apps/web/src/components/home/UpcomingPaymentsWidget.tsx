'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import type { MonthlyPayment } from '@foody/types';

interface Props {
  readonly payments: MonthlyPayment[];
}

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

function getUrgencyDot(daysUntilDue: number): string {
  if (daysUntilDue < 0) return 'bg-blue-600';
  if (daysUntilDue === 0) return 'bg-blue-500';
  if (daysUntilDue <= 3) return 'bg-sky-400';
  if (daysUntilDue <= 7) return 'bg-blue-400';
  return 'bg-sky-400';
}

function getDaysLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) return 'Vencido';
  if (daysUntilDue === 0) return 'Hoy';
  if (daysUntilDue === 1) return 'Mañana';
  return `${daysUntilDue}d`;
}

function getDaysLabelColor(daysUntilDue: number): string {
  if (daysUntilDue <= 0) return 'text-blue-500 dark:text-blue-400 font-bold';
  if (daysUntilDue <= 3) return 'text-sky-500 dark:text-sky-400 font-semibold';
  if (daysUntilDue <= 7) return 'text-blue-500 dark:text-blue-400';
  return 'text-slate-400 dark:text-slate-500';
}

/** Same criteria the home page uses for its server-rendered props. */
function filterUpcoming(payments: MonthlyPayment[]): MonthlyPayment[] {
  return payments
    .filter((p) => !p.isPaidThisMonth && p.daysUntilDue <= 30)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

const MAX_VISIBLE = 4;

export default function UpcomingPaymentsWidget({ payments: initialPayments }: Props) {
  const [payments, setPayments] = useState(initialPayments);

  // The server-rendered props can be stale (router prefetch / SW caches), so
  // re-fetch fresh data on mount — a payment just marked as paid disappears
  // without needing a full reload.
  useEffect(() => {
    fetch('/api/payments', { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: MonthlyPayment[] | null) => {
        if (Array.isArray(data)) setPayments(filterUpcoming(data));
      })
      .catch(() => undefined);
  }, []);

  const displayed = payments.slice(0, MAX_VISIBLE);

  return (
    <Link
      href="/payments"
      className="block bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm hover:border-brand-300 dark:hover:border-brand-500/50 hover:shadow-md active:scale-[0.99] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      aria-label="Ver todos los pagos"
    >
      {/* ── Header (centered title, chevron pinned right) ── */}
      <div className="relative flex items-center justify-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-lg shrink-0" aria-hidden="true">
          💳
        </span>
        <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">Pagos próximos</h2>
        <ChevronRightIcon className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 absolute right-0 top-1/2 -translate-y-1/2" aria-hidden="true" />
      </div>

      {/* ── Empty state ───────────────────────────────── */}
      {payments.length === 0 ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm pt-3 text-center">No hay pagos pendientes este mes 🎉</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 card-stagger mt-2">
          {displayed.map((p) => {
            const icon = CATEGORY_ICONS[p.category ?? 'other'] ?? '💰';
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5 min-w-0">
                {/* Urgency dot */}
                <span className={`w-2 h-2 rounded-full shrink-0 ${getUrgencyDot(p.daysUntilDue)}`} aria-hidden="true" />

                {/* Category icon */}
                <span className="text-base shrink-0 leading-none">{icon}</span>

                {/* Name */}
                <span className="flex-1 text-sm text-slate-800 dark:text-slate-100 truncate font-medium">{p.name}</span>

                {/* Days until due */}
                <span className={`text-xs shrink-0 ${getDaysLabelColor(p.daysUntilDue)}`}>{getDaysLabel(p.daysUntilDue)}</span>

                {/* Amount */}
                <span className="text-sm font-bold shrink-0 tabular-nums text-right text-slate-800 dark:text-slate-100">
                  {p.currency} {p.amount.toFixed(2)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Link>
  );
}
