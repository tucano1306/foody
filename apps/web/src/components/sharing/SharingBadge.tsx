'use client';

import { useEffect, useState } from 'react';

export default function SharingBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch('/api/sharing/pending-count', { credentials: 'include' });
        if (!cancelled && res.ok) {
          const json = await res.json() as { count: number };
          setCount(json.count);
        }
      } catch {
        // network failure — silent
      }
    }

    void fetchCount();
    // Re-poll every 60 s so the badge stays fresh without full page reload
    const id = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold shrink-0">
      {count > 9 ? '9+' : count}
    </span>
  );
}
