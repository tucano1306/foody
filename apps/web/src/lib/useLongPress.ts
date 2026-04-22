'use client';

import { useRef } from 'react';
import { haptic } from './haptic';

const DEFAULT_DELAY = 500;

export function useLongPress(onLongPress: () => void, delay = DEFAULT_DELAY) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);

  function start() {
    triggered.current = false;
    timer.current = setTimeout(() => {
      triggered.current = true;
      haptic([30, 20, 30]);
      onLongPress();
    }, delay);
  }

  function cancel() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  const handlers = {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onMouseDown: start,
    onMouseUp: cancel,
    onMouseLeave: cancel,
  };

  return {
    handlers,
    wasLongPressed: () => triggered.current,
  };
}
