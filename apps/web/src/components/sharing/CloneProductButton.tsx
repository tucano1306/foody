'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  readonly shareId: string;
  readonly productId: string;
}

export default function CloneProductButton({ shareId, productId }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    start(async () => {
      const res = await fetch(`/api/sharing/pantry/${shareId}/products`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        const json = await res.json() as { message?: string };
        setError(json.message ?? 'Error');
      }
    });
  }

  if (done) {
    return (
      <span className="block w-full py-1.5 text-center text-[11px] font-semibold rounded-xl bg-emerald-100 text-emerald-700">
        ✅ Añadido
      </span>
    );
  }

  return (
    <>
      {error && <p className="text-[10px] text-rose-500 mb-1">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="w-full py-1.5 text-[11px] font-semibold rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-50 transition"
      >
        {isPending ? '…' : '+ Agregar a mi despensa'}
      </button>
    </>
  );
}
