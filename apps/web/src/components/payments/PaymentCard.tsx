'use client';

import { useState, useTransition } from 'react';
import type { MonthlyPayment } from '@foody/types';
import { useRouter } from 'next/navigation';
import Markdown from '@/components/ui/Markdown';

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
  if (urgency === 'urgent') return `⏰ En ${daysUntilDue} días`;
  if (urgency === 'upcoming') return `⏰ En ${daysUntilDue} días`;
  return `⏰ En ${daysUntilDue} días`;
}

function getUrgencyBadgeCls(urgency: Urgency): string {
  if (urgency === 'today') return 'bg-red-500/20 text-red-300';
  if (urgency === 'urgent') return 'bg-amber-500/20 text-amber-300';
  if (urgency === 'upcoming') return 'bg-blue-500/20 text-blue-300';
  return 'bg-white/10 text-gray-300';
}

function getToggleLabel(isPending: boolean, isPaid: boolean): string {
  if (isPending) return '...';
  if (isPaid) return 'Desmarcar';
  return '✓ Marcar pagado';
}

export default function PaymentCard({ payment }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPaid, setIsPaid] = useState(payment.isPaidThisMonth);

  const icon = CATEGORY_ICONS[payment.category ?? 'other'] ?? '💰';
  const urgency = getUrgency(isPaid, payment.daysUntilDue);
  const circleColor = getCircleColor(urgency, isPaid);

  function togglePaid() {
    startTransition(async () => {
      const endpoint = `/api/proxy/payments/${payment.id}/mark-paid`;
      const method = isPaid ? 'DELETE' : 'POST';
      const res = await fetch(endpoint, { method, credentials: 'include' });
      if (res.ok) {
        setIsPaid(!isPaid);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col bg-gray-900 rounded-2xl p-5 shadow-lg hover:scale-[1.02] transition-transform duration-300">
      {/* Top row: icon + name + amount */}
      <div className="flex items-center gap-4">
        <div
          className="w-13 h-13 rounded-full flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: circleColor, width: '52px', height: '52px' }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-base truncate">{payment.name}</p>
          {payment.description && (
            <div className="text-gray-400 text-xs mt-0.5 line-clamp-1">
              <Markdown>{payment.description}</Markdown>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-white font-extrabold text-lg leading-tight">
            {payment.currency} {payment.amount.toFixed(2)}
          </p>
          <p className="text-gray-400 text-[11px]">Día {payment.dueDay} de cada mes</p>
        </div>
      </div>

      {/* Bottom row: badge + button */}
      <div className="mt-4 flex items-center justify-between gap-2">
        {isPaid ? (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300">
            ✓ Pagado este mes
          </span>
        ) : (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getUrgencyBadgeCls(urgency)}`}>
            {getUrgencyBadge(urgency, payment.daysUntilDue)}
          </span>
        )}

        <button
          type="button"
          onClick={togglePaid}
          disabled={isPending}
          className={`text-xs font-bold px-4 py-1.5 rounded-xl transition-colors disabled:opacity-50 ${
            isPaid
              ? 'bg-white/10 text-gray-300 hover:bg-white/20'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }`}
        >
          {getToggleLabel(isPending, isPaid)}
        </button>
      </div>
    </div>
  );
}
