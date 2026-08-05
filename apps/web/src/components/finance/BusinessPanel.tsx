'use client';

import Link from 'next/link';
import type { ScopeBreakdown } from '@/lib/finance-engine';
import { fmtMoney, LABEL, NUM } from './finance-ui';

interface Props {
  readonly scopes: ScopeBreakdown;
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
 * Solo se monta si hay algo marcado como negocio: quien no lo use no ve esta
 * sección jamás. El resultado del negocio va arriba porque es la única cifra
 * que no se puede deducir mirando el resto —los gastos personales ya salen en
 * «Tu mes»— y es la razón entera de separar.
 */
export default function BusinessPanel({ scopes }: Props) {
  if (!scopes.hasBusiness) return null;

  const { personal, business, businessResult: r } = scopes;
  const gana = r.result >= 0;

  return (
    <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-100 to-blue-100 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className={`text-sm font-black uppercase tracking-wide ${NUM}`}>🏢 Tu negocio</h2>
          <p className={`mt-1 text-xs ${LABEL}`}>
            {r.expensesWithoutIncome
              ? 'Sin facturación cargada todavía'
              : `Margen del ${r.margin.toFixed(0)} % sobre lo que facturas`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
            {gana ? 'Te deja' : 'Te cuesta'}
          </p>
          <p className={`text-xl font-black tabular-nums ${NUM}`}>{fmtMoney(Math.abs(r.result))}</p>
        </div>
      </div>

      <div className="divide-y divide-white/70 rounded-2xl bg-white/70 px-4">
        <Row emoji="💼" label="Factura al mes" value={fmtMoney(business.income)} />
        <Row emoji="📄" label="Pagos fijos del negocio" value={`−${fmtMoney(business.fixedPayments)}`} />
        {business.creditPayments > 0 && (
          <Row emoji="💳" label="Cuotas de crédito" value={`−${fmtMoney(business.creditPayments)}`} />
        )}
      </div>

      {/* El contraste con lo personal es lo que da perspectiva al número de arriba. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-white/70 px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">🏠 Gasto personal</p>
          <p className={`text-base font-black tabular-nums ${NUM}`}>{fmtMoney(personal.expenses)}</p>
        </div>
        <div className="rounded-2xl bg-white/70 px-3.5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">🏢 Gasto del negocio</p>
          <p className={`text-base font-black tabular-nums ${NUM}`}>{fmtMoney(business.expenses)}</p>
        </div>
      </div>

      <Link
        href="/payments"
        className="mt-3 block rounded-2xl bg-blue-500 px-4 py-2.5 text-center text-xs font-bold text-white shadow-sm transition hover:bg-blue-600"
      >
        Ver los gastos →
      </Link>
    </section>
  );
}
