'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type React from 'react';
import type { MonthlyPayment } from '@foody/types';
import Markdown from '@/components/ui/Markdown';
import PaymentDetailSheet from '@/components/payments/PaymentDetailSheet';
import MarkPaidModal, { type AppliedPayment } from '@/components/payments/MarkPaidModal';
import { daysUntilNextDue, nextDueDate } from '@/lib/payment-cycle';
import { formatMonthShort } from '@/lib/payment-aggregates';
interface Props {
  readonly payment: MonthlyPayment;
  readonly autoOpen?: boolean;
  readonly onDeleted?: (id: string) => void;
  readonly onUpdated?: (p: MonthlyPayment) => void;
  readonly onSnoozed?: (id: string, snoozedUntil: string) => void;
}

type Urgency = 'overdue' | 'today' | 'urgent' | 'upcoming' | 'normal';

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

function dayLabel(days: number): string {
  return `${days} día${days === 1 ? '' : 's'}`;
}

/** Short human date for the next due day, e.g. "15 may". */
function formatNextDue(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(d);
}

function getUrgency(isPaid: boolean, daysUntilDue: number): Urgency {
  if (isPaid) return 'normal';
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'today';
  if (daysUntilDue <= 3) return 'urgent';
  if (daysUntilDue <= 7) return 'upcoming';
  return 'normal';
}

function getCircleColor(urgency: Urgency, isPaid: boolean): string {
  if (isPaid) return '#10B981';
  if (urgency === 'overdue') return '#DC2626';
  if (urgency === 'today') return '#EF4444';
  if (urgency === 'urgent') return '#F59E0B';
  if (urgency === 'upcoming') return '#3B82F6';
  return '#6366F1';
}

function getUrgencyBadge(urgency: Urgency, daysUntilDue: number): string {
  if (urgency === 'overdue') return `⚠️ Venció hace ${dayLabel(Math.abs(daysUntilDue))}`;
  if (urgency === 'today') return '⚡ Vence hoy';
  return `⏰ En ${dayLabel(daysUntilDue)}`;
}

function getUrgencyBadgeCls(urgency: Urgency): string {
  if (urgency === 'overdue') return 'bg-red-100 dark:bg-red-500/25 text-red-700 dark:text-red-300';
  if (urgency === 'today') return 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300';
  if (urgency === 'urgent') return 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300';
  if (urgency === 'upcoming') return 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300';
  return 'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400';
}

function renderStatusBadge(isPaid: boolean, isSnoozed: boolean, urgency: Urgency, daysUntilDue: number): React.ReactNode {
  if (isPaid) {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
        ✓ Pagado este mes
      </span>
    );
  }
  if (isSnoozed) {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400">
        ⏸ Pospuesto 3 días
      </span>
    );
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getUrgencyBadgeCls(urgency)}`}>
      {getUrgencyBadge(urgency, daysUntilDue)}
    </span>
  );
}

function getSnoozeBtnLabel(pending: boolean, error: boolean): string {
  if (pending) return '⏳ Posponiendo...';
  if (error) return '❌ Error, intenta de nuevo';
  return '⏰ Posponer 3d';
}

export default function PaymentCard({ payment, autoOpen, onDeleted, onUpdated, onSnoozed }: Props) {
  const [, startTransition] = useTransition();
  const [isSnoozePending, startSnoozeTransition] = useTransition();
  const [isPaid, setIsPaid] = useState(payment.isPaidThisMonth);
  const [isSnoozed, setIsSnoozed] = useState(
    payment.snoozedUntil != null && new Date(payment.snoozedUntil) > new Date(),
  );
  const [currentPayment, setCurrentPayment] = useState<MonthlyPayment>(payment);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [snoozeError, setSnoozeError] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoOpen) return;
    const timer = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSheetOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [autoOpen]);

  const icon = CATEGORY_ICONS[currentPayment.category ?? 'other'] ?? '💰';
  const urgency = getUrgency(isPaid, currentPayment.daysUntilDue);
  const circleColor = getCircleColor(urgency, isPaid);
  const showQuickActions = !isPaid && !isSnoozed;
  const nextDueLabel = formatNextDue(currentPayment.nextDueDate);
  const unpaidMonths = currentPayment.unpaidMonths ?? [];

  const togglePaid = useCallback(() => {
    if (!isPaid) {
      // Opening the modal collects method + bank + amount, then POSTs.
      setMarkPaidOpen(true);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/payments/${currentPayment.id}/mark-paid`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({})) as { removed?: boolean; amount?: number };
        const removedAmount = body.removed && typeof body.amount === 'number' ? body.amount : 0;
        const removedCount = body.removed ? 1 : 0;
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curYear = now.getFullYear();
        const stillUnpaid = [...(currentPayment.unpaidMonths ?? [])];
        // Unpaid again: if this month's due day already passed it re-enters the debt.
        if (
          daysUntilNextDue(currentPayment.dueDay, false) < 0 &&
          !stillUnpaid.some((u) => u.month === curMonth && u.year === curYear)
        ) {
          stillUnpaid.push({ month: curMonth, year: curYear });
        }
        const next: MonthlyPayment = {
          ...currentPayment,
          isPaidThisMonth: false,
          daysUntilDue: daysUntilNextDue(currentPayment.dueDay, false),
          nextDueDate: nextDueDate(currentPayment.dueDay, false).toISOString(),
          unpaidMonths: stillUnpaid,
          missedMonths: stillUnpaid.length,
          accumulatedDebt: stillUnpaid.length * currentPayment.amount,
          totalPaidAllTime: Math.max(0, (currentPayment.totalPaidAllTime ?? 0) - removedAmount),
          paidCountAllTime: Math.max(0, (currentPayment.paidCountAllTime ?? 0) - removedCount),
        };
        setIsPaid(false);
        setCurrentPayment(next);
        onUpdated?.(next);
      }
    });
  }, [currentPayment, isPaid, onUpdated]);

  const handleMarkPaidConfirmed = useCallback((applied: AppliedPayment) => {
    const now = new Date();
    // A payment with accumulated debt settles the OLDEST month, so the current
    // cycle only flips to "paid" when the settled month is the current one.
    const settledCurrentMonth =
      applied.month === now.getMonth() + 1 && applied.year === now.getFullYear();
    const nowPaid = settledCurrentMonth || currentPayment.isPaidThisMonth;
    const stillUnpaid = (currentPayment.unpaidMonths ?? []).filter(
      (u) => !(u.month === applied.month && u.year === applied.year),
    );
    const next: MonthlyPayment = {
      ...currentPayment,
      isPaidThisMonth: nowPaid,
      daysUntilDue: daysUntilNextDue(currentPayment.dueDay, nowPaid),
      nextDueDate: nextDueDate(currentPayment.dueDay, nowPaid).toISOString(),
      unpaidMonths: stillUnpaid,
      missedMonths: stillUnpaid.length,
      accumulatedDebt: stillUnpaid.length * currentPayment.amount,
      totalPaidAllTime: (currentPayment.totalPaidAllTime ?? 0) + applied.amount,
      paidCountAllTime: (currentPayment.paidCountAllTime ?? 0) + 1,
      lastPaidAt: now.toISOString(),
    };
    setCurrentPayment(next);
    setIsPaid(nowPaid);
    setJustPaid(true);
    onUpdated?.(next);
  }, [currentPayment, onUpdated]);

  const snooze = useCallback(() => {
    setSnoozeError(false);
    startSnoozeTransition(async () => {
      const res = await fetch(`/api/payments/${currentPayment.id}/snooze`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({})) as { snoozedUntil?: string };
        const snoozedUntil = body.snoozedUntil ?? new Date(Date.now() + 3 * 86_400_000).toISOString();
        setIsSnoozed(true);
        onSnoozed?.(currentPayment.id, snoozedUntil);
      } else {
        const body = await res.json().catch(() => ({})) as { message?: string };
        console.error('[snooze] error:', res.status, body.message);
        setSnoozeError(true);
      }
    });
  }, [currentPayment.id]);

  const handleUpdated = useCallback((updated: MonthlyPayment) => {
    setCurrentPayment(updated);
    // Editing history records can flip the current month between paid/unpaid.
    setIsPaid(updated.isPaidThisMonth);
    onUpdated?.(updated);
  }, [onUpdated]);

  const handleDeleted = useCallback(() => {
    onDeleted?.(currentPayment.id);
  }, [currentPayment.id, onDeleted]);

  return (
    <div ref={cardRef}>
      {/* Tappable card */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        onAnimationEnd={(e) => { if (e.animationName === 'foody-pop') setJustPaid(false); }}
        className={`w-full text-left flex flex-col bg-stone-50 dark:bg-stone-800/80 border border-stone-100 dark:border-stone-700 rounded-2xl p-5 shadow-sm hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-[0.98] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500${justPaid ? ' animate-pop' : ''}`}
      >
        {/* Top row: icon + name + amount */}
        <div className="flex items-center gap-4">
          <div
            className="rounded-full flex items-center justify-center text-2xl shrink-0"
            style={{ backgroundColor: circleColor, width: '52px', height: '52px' }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-stone-800 dark:text-white font-bold text-base truncate">{currentPayment.name}</p>
            {currentPayment.description && (
              <div className="text-stone-500 dark:text-stone-400 text-xs mt-0.5 line-clamp-1">
                <Markdown>{currentPayment.description}</Markdown>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-stone-800 dark:text-white font-extrabold text-lg leading-tight">
              {currentPayment.isVariableAmount && (
                <span className="text-stone-400 dark:text-stone-500 mr-0.5" title="Monto variable">≈</span>
              )}
              {currentPayment.currency} {currentPayment.amount.toFixed(2)}
            </p>
            <p className="text-stone-400 dark:text-stone-500 text-[11px]">
              {currentPayment.isVariableAmount ? `Variable · Día ${currentPayment.dueDay}` : `Día ${currentPayment.dueDay} / mes`}
            </p>
          </div>
        </div>

        {/* Bottom row: status badge + payment mode */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {renderStatusBadge(isPaid, isSnoozed, urgency, currentPayment.daysUntilDue)}
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              currentPayment.isAutoPay
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400'
            }`}
          >
            {currentPayment.isAutoPay ? '🤖 Automático' : '✋ Manual'}
          </span>
        </div>

        {/* Accumulated debt banner */}
        {unpaidMonths.length > 0 && !isPaid && (
          <div className="mt-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-red-700 dark:text-red-300">
                🚨 Ya llevas acumulado
              </span>
              <span className="text-sm font-extrabold text-red-700 dark:text-red-300 shrink-0">
                {currentPayment.currency} {(unpaidMonths.length * currentPayment.amount).toFixed(2)}
              </span>
            </div>
            <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
              {unpaidMonths.length === 1 ? '1 mes sin pagar' : `${unpaidMonths.length} meses sin pagar`}
              {': '}
              {unpaidMonths.slice(0, 3).map((u) => formatMonthShort(u)).join(' · ')}
              {unpaidMonths.length > 3 && ` +${unpaidMonths.length - 3}`}
            </p>
          </div>
        )}

        {/* Next-payment banner — the cycle restarts after paying */}
        {isPaid && currentPayment.daysUntilDue > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🔄</span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Próximo pago
              </span>
            </div>
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              en {dayLabel(currentPayment.daysUntilDue)}
              {nextDueLabel && <span className="font-medium opacity-80"> · {nextDueLabel}</span>}
            </span>
          </div>
        )}
      </button>

      {/* Quick actions for urgent payments */}
      {showQuickActions && !isSnoozed && (
        <div className="flex gap-2 mt-2 px-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); togglePaid(); }}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-sm font-semibold transition-all"
          >
            ✅ Pagado
          </button>
          <button
            type="button"
            disabled={isSnoozePending}
            onClick={(e) => { e.stopPropagation(); snooze(); }}
            className="flex-1 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 active:scale-95 text-stone-700 dark:text-stone-200 text-sm font-semibold transition-all disabled:opacity-60"
          >
            {getSnoozeBtnLabel(isSnoozePending, snoozeError)}
          </button>
        </div>
      )}

      {/* Detail sheet */}
      <PaymentDetailSheet
        payment={currentPayment}
        isPaid={isPaid}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPaidToggle={togglePaid}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />

      {/* Mark paid modal */}
      <MarkPaidModal
        payment={currentPayment}
        open={markPaidOpen}
        onClose={() => setMarkPaidOpen(false)}
        onConfirmed={handleMarkPaidConfirmed}
      />
    </div>
  );
}
