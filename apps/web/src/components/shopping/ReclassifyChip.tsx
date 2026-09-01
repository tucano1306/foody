'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';
import { expenseKindMeta, type ExpenseKind } from '@/lib/expense-kind';

interface Props {
  readonly tripId: string;
  readonly storeName: string;
  readonly suggested: ExpenseKind;
}

/**
 * «Esto no parece super»: mueve un ticket ya guardado al Plan financiero.
 *
 * Existe por los tickets de ANTES. La clasificación no migra sola —ninguna
 * compra se muda de sección sin que el usuario lo diga— pero pedirle que entre
 * a cada ticket viejo, toque Editar y busque el selector es pedirle demasiado
 * por algo que el nombre de la tienda ya delata.
 *
 * Solo aparece cuando el detector reconoce la tienda, y es reversible desde el
 * detalle del ticket.
 */
export default function ReclassifyChip({ tripId, storeName, suggested }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const meta = expenseKindMeta(suggested);

  if (done) return null;

  async function move() {
    if (saving) return;
    setSaving(true);
    haptic(12);
    try {
      const res = await fetch(`/api/proxy/shopping-trips/${tripId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: suggested }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDone(true);
      haptic([15, 40, 20]);
      toast.show(`${storeName} ahora cuenta como ${meta.groupLabel.toLowerCase()} 🧭`, 'success');
      router.refresh();
    } catch {
      toast.show('No se pudo mover el ticket', 'error');
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={move}
      disabled={saving}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 transition active:scale-95 disabled:opacity-50"
    >
      <span aria-hidden="true">{meta.emoji}</span>
      {saving ? 'Moviendo…' : `¿${meta.label}? Muévelo al plan`}
    </button>
  );
}
