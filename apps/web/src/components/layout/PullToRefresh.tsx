'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { haptic } from '@/lib/haptic';

export default function PullToRefresh() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  async function refresh() {
    haptic(15);
    setSpinning(true);
    router.refresh();
    await new Promise((r) => setTimeout(r, 600));
    setSpinning(false);
  }

  const { pull, refreshing, ready } = usePullToRefresh(refresh);
  const active = pull > 0 || refreshing || spinning;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none"
      style={{
        transform: `translateY(${Math.max(pull - 40, 0)}px)`,
        opacity: active ? 1 : 0,
        transition: pull === 0 ? 'transform 0.25s, opacity 0.25s' : 'none',
      }}
    >
      <div className="mt-2 w-10 h-10 rounded-full bg-white shadow-lg border border-stone-200 flex items-center justify-center">
        <span
          className={`text-xl ${refreshing || spinning ? 'animate-spin' : ''} ${
            ready ? 'text-brand-600' : 'text-stone-400'
          }`}
          style={{
            transform: refreshing || spinning ? undefined : `rotate(${pull * 3}deg)`,
          }}
        >
          ↻
        </span>
      </div>
    </div>
  );
}
