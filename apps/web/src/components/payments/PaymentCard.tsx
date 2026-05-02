'use client';

import { useCallback, useState, useTransition } from 'react';
import type { MonthlyPayment } from '@foody/types';
import { useRouter } from 'next/navigation';
import Markdown from '@/components/ui/Markdown';
import PaymentDetailSheet from '@/components/payments/PaymentDetailSheet';

interface Props {
  readonly payment: MonthlyPayment;
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
  if (urgency === 'today') return 'bg-red-500/20 text-red-300';
  if (urgency === 'urgent') return 'bg-amber-500/20 text-amber-300';
  if (urgency === 'upcoming') return 'bg-blue-500/20 text-blue-300';
  return 'bg-white/10 text-gray-300';
}

export default function PaymentCard({ payment }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isPaid, setIsPaid] = useState(payment.isPaidThisMonth);
  const [currentPayment, setCurrentPayment] = useState<MonthlyPayment>(payment);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const icon = CATEGORY_ICONS[currentPayment.category ?? 'other'] ?? '💰';
  const urgency = getUrgency(isPaid, currentPayment.daysUntilDue);
  const circleColor = getCircleColor(urgency, isPaid);

  const togglePaid = useCallback(() => {
    startTransition(async () => {
      const endpoint = `/api/payments/${currentPayment.id}/mark-paid`;
      const method = isPaid ? 'DELETE' : 'POST';
      const res = await fetch(endpoint, { method, credentials: 'include' });
      if (res.ok) {
        setIsPaid((prev) => !prev);
        router.refresh();
      }
    });
  }, [currentPayment.id, isPaid, router]);

  const handleUpdated = useCallback((updated: MonthlyPayment) => {
    setCurrentPayment(updated);
  }, []);

  const handleDeleted = useCallback(() => {
    setDeleted(true);
  }, []);

  if (deleted) return null;

  return (
    <>
      {/* Tappable card */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full text-left flex flex-col bg-gray-800/80 rounded-2xl p-5 shadow-lg hover:bg-gray-800 active:scale-[0.98] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
            <p className="text-white font-bold text-base truncate">{currentPayment.name}</p>
            {currentPayment.description && (
              <div className="text-gray-400 text-xs mt-0.5 line-clamp-1">
                <Markdown>{currentPayment.description}</Markdown>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-white font-extrabold text-lg leading-tight">
              {currentPayment.currency} {currentPayment.amount.toFixed(2)}
            </p>
            <p className="text-gray-400 text-[11px]">Día {currentPayment.dueDay} / mes</p>
          </div>
        </div>

        {/* Bottom row: status badge */}
        <div className="mt-4 flex items-center justify-between gap-2">
          {isPaid ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
              ✓ Pagado este mes
            </span>
          ) : (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getUrgencyBadgeCls(urgency)}`}>
              {getUrgencyBadge(urgency, currentPayment.daysUntilDue)}
            </span>
          )}
          <span className="text-gray-500 text-xs">Toca para ver más →</span>
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
