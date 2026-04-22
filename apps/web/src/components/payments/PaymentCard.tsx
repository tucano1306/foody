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

function getBorderCls(urgency: Urgency, isPaid: boolean): string {
  if (urgency === 'today') return 'border-red-300 bg-red-50';
  if (urgency === 'urgent') return 'border-amber-300 bg-amber-50';
  if (isPaid) return 'border-green-200 bg-green-50';
  return 'border-stone-100 bg-white';
}

function getBadgeCls(urgency: Urgency): string {
  if (urgency === 'today') return 'bg-red-200 text-red-800';
  if (urgency === 'urgent') return 'bg-amber-200 text-amber-800';
  return 'bg-stone-100 text-stone-600';
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
  const borderCls = getBorderCls(urgency, isPaid);

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
    <div className={`rounded-2xl border p-4 shadow-sm transition-all ${borderCls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className={`font-semibold text-sm ${isPaid ? 'text-green-700' : 'text-stone-800'}`}>
              {payment.name}
            </p>
            {payment.description && (
              <div className="text-xs text-stone-400 mt-0.5">
                <Markdown>{payment.description}</Markdown>
              </div>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-stone-800 text-sm">
            {payment.currency} {payment.amount.toFixed(2)}
          </p>
          <p className="text-xs text-stone-400">
            Día {payment.dueDay} de cada mes
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {isPaid ? (
          <span className="text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
            ✓ Pagado este mes
          </span>
        ) : (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${getBadgeCls(urgency)}`}
          >
            {urgency === 'today' ? '⚡ Vence hoy' : `⏰ En ${payment.daysUntilDue} días`}
          </span>
        )}

        <button
          type="button"
          onClick={togglePaid}
          disabled={isPending}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            isPaid
              ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          } disabled:opacity-50`}
        >
          {getToggleLabel(isPending, isPaid)}
        </button>
      </div>
    </div>
  );
}
