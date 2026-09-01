'use client';

import { useState } from 'react';
import { haptic } from '@/lib/haptic';
import { useToast } from '@/components/ui/Toast';
import type { DebtWithProjection } from '@/lib/debt-data';
import type { DuplicateSuspect } from '@/lib/duplicate-obligations';
import { fmtMoney } from './debt-ui';

interface Props {
  readonly suspect: DuplicateSuspect;
  readonly onResolved: (debt: DebtWithProjection) => void;
}

/**
 * «¿Esto y aquello son el mismo pago?» — la pregunta que arregla el doble conteo.
 *
 * Aparece sobre la deuda sospechosa y solo tiene dos respuestas, porque solo hay
 * dos: o es el mismo dinero y el plan debe contarlo una vez, o son cosas
 * distintas y no hay que volver a preguntar.
 *
 * Ninguna de las dos borra nada. Tener la cuota del coche en Pagos Y en Deudas
 * es lo correcto —una lleva el recordatorio, la otra el saldo y el interés—; lo
 * que estaba mal era que el plan restara las dos.
 */
export default function DuplicateBanner({ suspect, onResolved }: Props) {
  const toast = useToast();
  const [saving, setSaving] = useState<'link' | 'dismiss' | null>(null);

  async function resolve(mode: 'link' | 'dismiss') {
    if (saving) return;
    setSaving(mode);
    haptic(12);
    try {
      const res = await fetch(`/api/debts/${suspect.debtId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'link'
            ? { linkedPaymentId: suspect.paymentId }
            : { duplicateDismissed: true },
        ),
      });
      if (!res.ok) throw new Error();
      haptic([15, 40, 20]);
      toast.show(
        mode === 'link'
          ? `Listo: ${fmtMoney(suspect.amount)} dejan de contarse dos veces`
          : 'Entendido, son gastos distintos',
        'success',
      );
      onResolved((await res.json()) as DebtWithProjection);
    } catch {
      toast.show('No se pudo guardar', 'error');
      setSaving(null);
    }
  }

  return (
    <div className="rounded-3xl border-2 border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-black text-black">
        👀 ¿«{suspect.paymentName}» y «{suspect.debtName}» son el mismo pago?
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">
        En Pagos tienes <strong>{suspect.paymentName}</strong> por{' '}
        <strong>{fmtMoney(suspect.amount)}</strong> al mes, y esta deuda tiene la misma cuota.
        Si son lo mismo, el plan está restando ese dinero dos veces.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => void resolve('link')}
          className="rounded-2xl bg-blue-500 py-3 text-xs font-black text-white shadow-sm transition active:scale-95 disabled:opacity-60"
        >
          {saving === 'link' ? 'Guardando…' : 'Sí, es el mismo'}
        </button>
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => void resolve('dismiss')}
          className="rounded-2xl border border-sky-200 bg-white py-3 text-xs font-bold text-slate-600 transition active:scale-95 disabled:opacity-60"
        >
          {saving === 'dismiss' ? 'Guardando…' : 'No, son distintos'}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        No se borra nada: la deuda sigue con su saldo e interés, y el recibo con su recordatorio.
      </p>
    </div>
  );
}
