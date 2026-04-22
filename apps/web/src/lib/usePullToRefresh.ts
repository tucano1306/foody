'use client';

import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;
const MAX_PULL = 120;

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (globalThis.window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && globalThis.window.scrollY === 0) {
        setPull(Math.min(delta * 0.5, MAX_PULL));
      }
    }

    async function onTouchEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    }

    globalThis.window.addEventListener('touchstart', onTouchStart, { passive: true });
    globalThis.window.addEventListener('touchmove', onTouchMove, { passive: true });
    globalThis.window.addEventListener('touchend', onTouchEnd);
    return () => {
      globalThis.window.removeEventListener('touchstart', onTouchStart);
      globalThis.window.removeEventListener('touchmove', onTouchMove);
      globalThis.window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, pull, refreshing]);

  const ready = pull >= THRESHOLD;

  return { pull, refreshing, ready };
}
