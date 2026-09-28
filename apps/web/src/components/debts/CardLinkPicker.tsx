'use client';

import { useState } from 'react';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { haptic } from '@/lib/haptic';

interface Props {
  readonly debt: DebtWithProjection;
  /** Las otras tarjetas de crédito del usuario. */
  readonly candidates: readonly DebtWithProjection[];
  readonly onChanged: (snapshot: DebtsSnapshot) => void;
}

/**
 * «Esta deuda es otro saldo de la misma tarjeta».
 *
 * Un solo selector: suelta, o la tarjeta de la que forma parte. Al elegir, los
 * tramos se agrupan en la lista y se abonan juntos (ver CardGroupCard).
 */
export default function CardLinkPicker({ debt, candidates, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (debt.kind !== 'credit_card' || candidates.length === 0) return null;

  const actual = debt.cardGroup ? candidates.find((c) => c.cardGroup === debt.cardGroup)?.id ?? '' : '';

  async function cambiar(withDebtId: string) {
    haptic();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/debts/${debt.id}/card`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ withDebtId: withDebtId || null }),
      });
      const data = (await res.json().catch(() => ({}))) as DebtsSnapshot & { message?: string };
      if (!res.ok) throw new Error(data.message ?? 'No se pudo cambiar la tarjeta');
      onChanged(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
      <label htmlFor={`card-${debt.id}`} className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-600">💳 Otro saldo de la tarjeta</span>
        <select
          id={`card-${debt.id}`}
          value={actual}
          disabled={busy}
          onChange={(e) => cambiar(e.target.value)}
          className="max-w-[55%] truncate rounded-xl bg-sky-50 px-2.5 py-1.5 text-sm font-semibold text-black focus:outline-none disabled:opacity-50"
        >
          <option value="">Va suelta</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-2 text-[11px] font-semibold text-blue-800">{error}</p>}
    </div>
  );
}
