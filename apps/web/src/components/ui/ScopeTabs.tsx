'use client';

import { haptic } from '@/lib/haptic';
import type { ScopeFilter, ScopeSummary } from '@/lib/expense-scope';

interface Props {
  readonly value: ScopeFilter;
  readonly onChange: (scope: ScopeFilter) => void;
  /** Los tres totales, para enseñarlos bajo cada pestaña. */
  readonly summary: ScopeSummary;
  /** Cómo se escribe el dinero en esta pantalla. */
  readonly format: (value: number) => string;
}

const TABS = [
  { id: 'all', emoji: '📊', label: 'Todo' },
  { id: 'personal', emoji: '🏠', label: 'Personal' },
  { id: 'business', emoji: '🏢', label: 'Negocio' },
] as const;

/**
 * Personal / Negocio / Todo, con su total bajo cada pestaña.
 *
 * Vive aquí y no repetido en cada pantalla porque tiene que comportarse igual
 * en todas: si en Pagos un gasto mixto sale en las dos vistas con su parte
 * correspondiente, en Deudas y en Compras tiene que pasar exactamente lo mismo.
 * Tres copias del mismo selector acaban divergiendo, y una divergencia aquí
 * significa que dos pantallas de la misma app dan cifras distintas del mismo
 * dinero.
 *
 * NO se monta cuando no hay nada marcado como negocio: quien no lo use no se
 * entera de que existe, y quien lo use lo encuentra sin buscarlo.
 */
export default function ScopeTabs({ value, onChange, summary, format }: Props) {
  const hasBusiness = summary.businessCount + summary.mixedCount > 0;
  if (!hasBusiness) return null;

  const totals: Record<ScopeFilter, number> = {
    all: summary.total,
    personal: summary.personal,
    business: summary.business,
  };

  return (
    <div className="flex gap-1.5 rounded-2xl bg-sky-100/70 p-1.5">
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              haptic();
              onChange(tab.id);
            }}
            aria-pressed={active}
            className={`flex-1 rounded-xl px-2 py-2.5 transition-all duration-150 active:scale-95 ${
              active ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <span className="block text-xs font-bold leading-tight">
              <span aria-hidden="true">{tab.emoji}</span> {tab.label}
            </span>
            <span
              className={`block text-[11px] font-semibold ${active ? 'text-white/80' : 'text-slate-400'}`}
            >
              {format(totals[tab.id])}
            </span>
          </button>
        );
      })}
    </div>
  );
}
