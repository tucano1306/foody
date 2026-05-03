'use client';

import { useCallback, useState, useTransition } from 'react';
import type { MonthlyPayment } from '@foody/types';
import Markdown from '@/components/ui/Markdown';
import PaymentDetailSheet from '@/components/payments/PaymentDetailSheet';

interface Props {
  readonly payment: MonthlyPayment;
  readonly onDeleted?: (id: string) => void;
  readonly onUpdated?: (p: MonthlyPayment) => void;
  readonly onPaidToggle?: (id: string, nowPaid: boolean) => void;
}

type Urgency = 'today' | 'urgent' | 'upcoming' | 'normal';

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

function getUrgency(isPaid: boolean, daysUntilDue: number): Urgency {
  if (isPaid) return 'normal';
  if (daysUntilDue === 0) return 'today';
  if (daysUntilDue <= 3) return 'urgent';
  if (daysUntilDue <= 7) return 'upcoming';
  return 'normal';
}

function getCircleColor(urgency: Urgency, isPaid: boolean): string {
  if (isPaid) return '#10B981';
  if (urgency === 'today') return '#EF4444';
  if (urgency === 'urgent') return '#F59E0B';
  if (urgency === 'upcoming') return '#3B82F6';
  return '#6366F1';
}

function getUrgencyBadge(urgency: Urgency, daysUntilDue: number): string {
  if (urgency === 'today') return '⚡ Vence hoy';
  if (urgency === 'urgent') return `⏰ En ${daysUntilDue} día${daysUntilDue === 1 ? '' : 's'}`;
  if (urgency === 'upcoming') return `⏰ En ${daysUntilDue} día${daysUntilDue === 1 ? '' : 's'}`;
  return `⏰ En ${daysUntilDue} día${daysUntilDue === 1 ? '' : 's'}`;
}

function getUrgencyBadgeCls(urgency: Urgency): string {
  if (urgency === 'today') return 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300';
  if (urgency === 'urgent') return 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300';
  if (urgency === 'upcoming') return 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300';
  return 'bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-400';
}

export default function PaymentCard({ payment, onDeleted, onUpdated, onPaidToggle }: Props) {
  const [, startTransition] = useTransition();
  const [isPaid, setIsPaid] = useState(payment.isPaidThisMonth);
  const [currentPayment, setCurrentPayment] = useState<MonthlyPayment>(payment);
  const [sheetOpen, setSheetOpen] = useState(false);

  const icon = CATEGORY_ICONS[currentPayment.category ?? 'other'] ?? '💰';
  const urgency = getUrgency(isPaid, currentPayment.daysUntilDue);
  const circleColor = getCircleColor(urgency, isPaid);

  const togglePaid = useCallback(() => {
    startTransition(async () => {
      const endpoint = `/api/payments/${currentPayment.id}/mark-paid`;
      const method = isPaid ? 'DELETE' : 'POST';
      const res = await fetch(endpoint, { method, credentials: 'include' });
      if (res.ok) {
        const nowPaid = !isPaid;
        setIsPaid(nowPaid);
        onPaidToggle?.(currentPayment.id, nowPaid);
      }
    });
  }, [currentPayment.id, isPaid, onPaidToggle]);

  const handleUpdated = useCallback((updated: MonthlyPayment) => {
    setCurrentPayment(updated);
    onUpdated?.(updated);
  }, [onUpdated]);

  const handleDeleted = useCallback(() => {
    onDeleted?.(currentPayment.id);
  }, [currentPayment.id, onDeleted]);

  return (
    <>
      {/* Tappable card */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full text-left flex flex-col bg-stone-50 dark:bg-stone-800/80 border border-stone-100 dark:border-stone-700 rounded-2xl p-5 shadow-sm hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-[0.98] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
              {currentPayment.currency} {currentPayment.amount.toFixed(2)}
            </p>
            <p className="text-stone-400 dark:text-stone-500 text-[11px]">Día {currentPayment.dueDay} / mes</p>
          </div>
        </div>

        {/* Bottom row: status badge */}
        <div className="mt-4 flex items-center justify-between gap-2">
          {isPaid ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              ✓ Pagado este mes
            </span>
          ) : (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getUrgencyBadgeCls(urgency)}`}>
              {getUrgencyBadge(urgency, currentPayment.daysUntilDue)}
            </span>
          )}
          <span className="text-stone-400 dark:text-stone-500 text-xs">Toca para ver más →</span>
        </div>
      </button>

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
    </>
  );
}
