'use client';

import type { ScopeItemization, ScopeSideKey } from '@/lib/scope-items';
import ModalShell from './ModalShell';
import { fmtMoney } from './finance-ui';

interface Props {
  readonly side: ScopeSideKey;
  readonly data: ScopeItemization;
  readonly onClose: () => void;
}

const SIDE_META: Record<ScopeSideKey, { emoji: string; title: string; header: string }> = {
  personal: { emoji: '🏠', title: 'Tu gasto personal', header: 'from-sky-100 to-blue-100' },
  business: { emoji: '🏢', title: 'El gasto del negocio', header: 'from-blue-100 to-sky-100' },
};

/**
 * De dónde sale la cifra: la cuenta entera, línea por línea.
 *
 * «Gasto personal $4,444» no se podía reconstruir mirando: es la suma de
 * cuatro bloques repartidos por porcentaje, y un pago mixto al 60 % aporta a
 * los dos lados a la vez. Sin poder abrirlo, el número había que creérselo.
 *
 * El total se repite ARRIBA y al final de cada bloque a propósito: la pregunta
 * que trae aquí al usuario es «¿por qué tanto?», y se responde viendo qué
 * bloque pesa, no leyendo una lista plana de quince recibos.
 */
export default function ScopeDetailSheet({ side, data, onClose }: Props) {
  const meta = SIDE_META[side];
  const otroLado = side === 'personal' ? 'del negocio' : 'personal';

  return (
    <ModalShell
      emoji={meta.emoji}
      title={meta.title}
      headerClass={meta.header}
      subtitle={`${fmtMoney(data.expenses)} al mes, repartidos así`}
      onClose={onClose}
    >
      {data.expenseGroups.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">
          No hay gastos de este lado.
        </p>
      )}

      <div className="space-y-3">
        {data.expenseGroups.map((group) => (
          <div key={group.key} className="overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-sky-100 bg-sky-50/70 px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
                <span aria-hidden="true">{group.emoji}</span>
                {group.label}
              </span>
              <span className="text-sm font-black tabular-nums text-black">
                {fmtMoney(group.total)}
              </span>
            </div>

            <ul className="divide-y divide-sky-50">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {item.label}
                    </span>
                    {/* Solo los mixtos necesitan explicación: en los demás el
                        importe repartido ES el importe, y decir «100 % de
                        $917» sería ruido en cada fila. */}
                    {item.isSplit && (
                      <span className="block text-[11px] text-slate-500">
                        {Math.round(item.sharePct)} % de {fmtMoney(item.fullAmount)} — el resto es {otroLado}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums text-black">
                    {fmtMoney(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* El total, otra vez, al final: cierra la cuenta que se acaba de leer. */}
      {data.expenseGroups.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-linear-to-r from-sky-100 to-blue-100 px-4 py-3.5">
          <span className="text-xs font-black uppercase tracking-wide text-slate-600">
            Total {side === 'personal' ? 'personal' : 'del negocio'}
          </span>
          <span className="text-lg font-black tabular-nums text-black">
            {fmtMoney(data.expenses)}
          </span>
        </div>
      )}

      {/* Lo que entra por este lado. Solo si hay algo: en el lado personal sin
          ingresos cargados, una fila «$0» no aporta nada. */}
      {data.incomeItems.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-2xl bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-sky-100 bg-sky-50/70 px-4 py-2.5">
            <span className="text-xs font-black uppercase tracking-wide text-slate-600">
              💼 Lo que entra por este lado
            </span>
            <span className="text-sm font-black tabular-nums text-black">
              {fmtMoney(data.income)}
            </span>
          </div>
          <ul className="divide-y divide-sky-50">
            {data.incomeItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{item.label}</span>
                  {item.isSplit && (
                    <span className="block text-[11px] text-slate-500">
                      {Math.round(item.sharePct)} % de {fmtMoney(item.fullAmount)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums text-black">
                  {fmtMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ModalShell>
  );
}
