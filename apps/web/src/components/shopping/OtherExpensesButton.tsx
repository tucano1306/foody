'use client';

import { useCallback, useEffect, useState } from 'react';
import { haptic } from '@/lib/haptic';
import { expenseKindMeta, type ExpenseKind } from '@/lib/expense-kind';
import ModalShell from '@/components/finance/ModalShell';
import ExpenseDetailSheet from '@/components/finance/ExpenseDetailSheet';
import { fmtMoney } from '@/components/finance/finance-ui';

interface KindTotal {
  kind: ExpenseKind;
  total: number;
  count: number;
}

interface Props {
  /** Total del mes, ya calculado en el servidor: la fila se pinta sin esperar. */
  readonly total: number;
}

/**
 * «Gastos fuera del super» en la lista de Compras.
 *
 * Era una tarjeta con dos renglones de explicación —«8 gastos… $191.76 en
 * comida fuera, farmacia o gasolina — están en tu plan»— que contaba con texto
 * lo que se ve mejor abriéndolo. Ahora es un título, una cifra y un chevron; el
 * detalle aparece al tocar, que es donde el usuario lo va a buscar.
 *
 * Dos niveles: primero la CLASIFICACIÓN (cuánto en comida, cuánto en farmacia…)
 * y desde ahí los tickets de un tipo, reutilizando la misma hoja que el plan.
 */
export default function OtherExpensesButton({ total }: Props) {
  const [open, setOpen] = useState(false);
  const [byKind, setByKind] = useState<KindTotal[] | null>(null);
  /** Tipo abierto en el segundo nivel. */
  const [zoom, setZoom] = useState<ExpenseKind | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/spend-breakdown?kind=all', {
        credentials: 'include',
        cache: 'no-store',
      });
      setByKind(res.ok ? ((await res.json()) as { byKind: KindTotal[] }).byKind ?? [] : []);
    } catch {
      setByKind([]);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const shown = byKind ?? [];
  const sheetTotal = byKind === null
    ? total
    : Math.round(shown.reduce((s, k) => s + k.total, 0) * 100) / 100;

  return (
    <>
      <button
        type="button"
        onClick={() => { haptic(); setOpen(true); }}
        className="flex w-full items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-left transition active:scale-[0.99] hover:bg-blue-100"
      >
        <span className="text-2xl" aria-hidden="true">🧭</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-blue-800">
          Gastos fuera del super
        </span>
        <span className="shrink-0 text-sm font-black tabular-nums text-blue-900">
          {fmtMoney(total)}
        </span>
        <span aria-hidden="true" className="shrink-0 text-sm text-blue-400">›</span>
      </button>

      {open && zoom === null && (
        <ModalShell
          emoji="🧭"
          title="Fuera del super"
          headerClass="from-blue-100 to-sky-100"
          subtitle={`${fmtMoney(sheetTotal)} este mes en gastos que no son de despensa`}
          onClose={() => setOpen(false)}
        >
          {byKind === null && (
            <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
          )}

          {byKind !== null && shown.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Este mes no hay gastos fuera del super.
            </p>
          )}

          <div className="space-y-2">
            {shown.map((k) => {
              const meta = expenseKindMeta(k.kind);
              return (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => { haptic(); setZoom(k.kind); }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="shrink-0 text-xl" aria-hidden="true">{meta.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {meta.groupLabel}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {k.count} {k.count === 1 ? 'ticket' : 'tickets'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums text-black">
                    {fmtMoney(k.total)}
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-slate-300">›</span>
                </button>
              );
            })}
          </div>
        </ModalShell>
      )}

      {/* Segundo nivel: los tickets de un tipo, con la misma hoja que el plan
          —se editan, se borran y se agregan desde aquí igual que allí—. */}
      {zoom !== null && (
        <ExpenseDetailSheet
          expenseKind={zoom}
          onClose={() => setZoom(null)}
          onChanged={() => void load()}
        />
      )}
    </>
  );
}
