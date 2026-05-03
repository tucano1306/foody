'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  if (daysUntilDue === 0) return 'bg-red-500';
  if (daysUntilDue <= 3) return 'bg-amber-400';
  if (daysUntilDue <= 7) return 'bg-blue-400';
  return 'bg-indigo-400';
}

function getDaysLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'Hoy';
  if (daysUntilDue === 1) return 'Mañana';
  return `${daysUntilDue}d`;
}

function getDaysLabelColor(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'text-red-500 dark:text-red-400 font-bold';
  if (daysUntilDue <= 3) return 'text-amber-500 dark:text-amber-400 font-semibold';
  if (daysUntilDue <= 7) return 'text-blue-500 dark:text-blue-400';
  return 'text-stone-400 dark:text-stone-500';
}

const MAX_VISIBLE = 4;

export default function UpcomingPaymentsWidget({ payments }: Props) {
  const [revealed, setRevealed] = useState(false);

  const displayed = payments.slice(0, MAX_VISIBLE);
  const remaining = payments.length - displayed.length;

  return (
    <section className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-100 dark:border-stone-800 shadow-sm">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-base font-bold text-stone-800 dark:text-stone-100 flex-1">💳 Pagos próximos</h2>

        {/* Reveal toggle — privacy feature */}
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={revealed ? 'Ocultar montos' : 'Revelar montos'}
          title={revealed ? 'Ocultar montos' : 'Revelar montos'}
        >
          {revealed ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        <Link
          href="/payments"
          className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 transition-colors"
        >
          Ver todos →
        </Link>
      </div>

      {/* ── Subtitle hint when hidden ─────────────────── */}
      {!revealed && payments.length > 0 && (
        <p className="text-stone-400 dark:text-stone-500 text-xs mb-3">Montos ocultos — toca 👁 para revelar</p>
      )}

      {/* ── Empty state ───────────────────────────────── */}
      {payments.length === 0 ? (
        <p className="text-stone-400 dark:text-stone-500 text-sm py-2">No hay pagos pendientes este mes 🎉</p>
      ) : (
        <>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {displayed.map((p) => {
              const icon = CATEGORY_ICONS[p.category ?? 'other'] ?? '💰';
              const dotColor = getUrgencyDot(p.daysUntilDue);
              const daysLabel = getDaysLabel(p.daysUntilDue);
              const daysColor = getDaysLabelColor(p.daysUntilDue);

              return (
                <li key={p.id} className="flex items-center gap-3 py-2.5 min-w-0">
                  {/* Urgency dot */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />

                  {/* Category icon */}
                  <span className="text-base shrink-0 leading-none">{icon}</span>

                  {/* Name */}
                  <span className="flex-1 text-sm text-stone-800 dark:text-stone-100 truncate font-medium">{p.name}</span>

                  {/* Days until due */}
                  <span className={`text-xs shrink-0 ${daysColor}`}>{daysLabel}</span>

                  {/* Amount — revealed or masked */}
                  <span
                    className="text-sm font-bold shrink-0 tabular-nums w-24 text-right"
                    aria-label={revealed ? `${p.currency} ${p.amount.toFixed(2)}` : 'Monto oculto'}
                  >
                    {revealed ? (
                      <span className="text-stone-800 dark:text-stone-100">{p.currency} {p.amount.toFixed(2)}</span>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600 tracking-widest select-none">••••••</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {remaining > 0 && (
            <Link
              href="/payments"
              className="mt-3 block text-center text-xs text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
            >
              +{remaining} pago{remaining === 1 ? '' : 's'} más →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
