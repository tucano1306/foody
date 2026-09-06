'use client';

import { useState } from 'react';
import type { ScopeBreakdown } from '@/lib/finance-engine';
import { haptic } from '@/lib/haptic';
import { itemizeScope, type ScopeItemsInput, type ScopeSideKey } from '@/lib/scope-items';
import ScopeDetailSheet from './ScopeDetailSheet';
import { fmtMoney, LABEL, NUM } from './finance-ui';

interface Props {
  readonly scopes: ScopeBreakdown;
  /** Lo que hace falta para reconstruir cada cifra línea por línea. */
  readonly items: ScopeItemsInput;
}

function Row({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
        <span aria-hidden="true">{emoji}</span>
        {label}
      </span>
      <span className={`text-sm font-black tabular-nums ${NUM}`}>{value}</span>
    </div>
  );
}

/**
 * Lo tuyo y lo del negocio, lado a lado.
 *
 * La tarjeta se llamaba «Tu negocio» y dentro enseñaba «Gasto personal
 * $4,444». Se contradecía sola: o es la sección del negocio, o es el reparto
 * entre los dos. Es lo segundo —la gracia está en comparar—, así que ahora el
 * título lo dice y el resultado del negocio va en su propio bloque, rotulado.
 *
 * Las dos cifras se abren: son la suma de cuatro bloques repartidos por
 * porcentaje y no había forma de reconstruirlas mirando.
 *
 * Solo se monta si hay algo marcado como negocio: quien no lo use no ve esta
 * sección jamás.
 */
export default function BusinessPanel({ scopes, items }: Props) {
  const [openSide, setOpenSide] = useState<ScopeSideKey | null>(null);

  if (!scopes.hasBusiness) return null;

  const { personal, business, businessResult: r } = scopes;
  const gana = r.result >= 0;

  const tiles: { side: ScopeSideKey; emoji: string; label: string; amount: number }[] = [
    { side: 'personal', emoji: '🏠', label: 'Gasto personal', amount: personal.expenses },
    { side: 'business', emoji: '🏢', label: 'Gasto del negocio', amount: business.expenses },
  ];

  return (
    <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
      <div className="mb-4">
        <h2 className={`text-sm font-black ${NUM}`}>
          🏢 Personal y negocio
        </h2>
        <p className={`mt-1 text-xs ${LABEL}`}>
          En qué se reparte lo que sale de tu cuenta cada mes
        </p>
      </div>

      {/* Las dos cifras, tocables. Antes eran dos rectángulos muertos con un
          número que había que creerse. */}
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <button
            key={t.side}
            type="button"
            onClick={() => { haptic(); setOpenSide(t.side); }}
            className="rounded-2xl bg-white/70 px-3.5 py-3 text-left transition active:scale-[0.98] hover:bg-white"
          >
            <span className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-slate-500">
                {t.emoji} {t.label}
              </span>
              <span aria-hidden="true" className="text-sm text-slate-300">›</span>
            </span>
            <span className={`block text-base font-black tabular-nums ${NUM}`}>
              {fmtMoney(t.amount)}
            </span>
            <span className="block text-[11px] text-slate-400">Ver de dónde sale</span>
          </button>
        ))}
      </div>

      {/* ── El negocio, en su propio bloque ────────────────────────────────
          Estas tres filas SÍ son solo del negocio, y ahora lo dice el rótulo
          en vez de darlo por supuesto desde el título de la tarjeta. */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-bold text-slate-500">
            Cómo le va al negocio
          </p>
          <p className="text-[11px] text-slate-500">
            {gana ? 'Te deja' : 'Te cuesta'}{' '}
            <span className={`text-sm font-black tabular-nums ${NUM}`}>
              {fmtMoney(Math.abs(r.result))}
            </span>
          </p>
        </div>

        <div className="divide-y divide-white/70 rounded-2xl bg-white/70 px-4">
          <Row emoji="💼" label="Factura al mes" value={fmtMoney(business.income)} />
          <Row emoji="📄" label="Pagos fijos del negocio" value={`−${fmtMoney(business.fixedPayments)}`} />
          {business.creditPayments > 0 && (
            <Row emoji="💳" label="Cuotas de crédito" value={`−${fmtMoney(business.creditPayments)}`} />
          )}
          {business.groceries > 0 && (
            <Row emoji="🛒" label="Super del negocio" value={`−${fmtMoney(business.groceries)}`} />
          )}
          {business.otherExpenses > 0 && (
            <Row emoji="🍔" label="Otros gastos del negocio" value={`−${fmtMoney(business.otherExpenses)}`} />
          )}
        </div>

        <p className="mt-2 text-[11px] text-slate-500">
          {r.expensesWithoutIncome
            ? 'Sin facturación cargada: ese gasto sale entero de tu bolsillo.'
            : `Margen del ${r.margin.toFixed(0)} % sobre lo que facturas.`}
        </p>
      </div>

      {openSide !== null && (
        <ScopeDetailSheet
          side={openSide}
          data={itemizeScope(items, openSide)}
          onClose={() => setOpenSide(null)}
        />
      )}
    </section>
  );
}
