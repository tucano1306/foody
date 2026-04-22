'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  readonly tripId: string;
}

export default function DeleteTripButton({ tripId }: Readonly<Props>) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    if (!confirm('¿Eliminar este ticket? Se recalcularán los totales de los productos.'))
      return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proxy/shopping-trips/${tripId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(await res.text());
      }
      router.push('/shopping-trips');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar');
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={submitting}
      className="w-full rounded-xl border border-red-200 text-red-600 px-4 py-3 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition"
    >
      {submitting ? 'Eliminando…' : '🗑️ Eliminar ticket'}
    </button>
  );
}
