'use client';

import { useRef } from 'react';

interface SwipeOptions {
  readonly onSwipeLeft?: () => void;
  readonly onSwipeRight?: () => void;
  readonly threshold?: number;
}

/**
 * Minimal touch-swipe hook (no external deps). Returns handlers to spread on an element.
 */
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 60 }: SwipeOptions) {
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  }

  return { onTouchStart, onTouchEnd };
}
