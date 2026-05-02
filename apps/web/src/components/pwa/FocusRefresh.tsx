'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Calls router.refresh() when the tab regains focus or becomes visible.
 *  Throttled to avoid hammering the server on rapid tab-switches.
 */
const THROTTLE_MS = 30_000;

export default function FocusRefresh() {
  const router = useRouter();
  const lastRef = useRef<number>(0);

  useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      if (now - lastRef.current < THROTTLE_MS) return;
      lastRef.current = now;
      router.refresh();
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') maybeRefresh();
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [router]);

  return null;
}
