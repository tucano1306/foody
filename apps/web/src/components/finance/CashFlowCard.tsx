'use client';

import { motion } from 'framer-motion';
import type { CashFlow } from '@/lib/finance-engine';
import type { BaselineSource } from '@/lib/grocery-insights';
import { CARD, LABEL, NUM, fmtMoney } from './finance-ui';

const GROCERY_HINT: Record<BaselineSource, string> = {
  pace: 'según tus compras reales',
  average: 'tu promedio de tickets',
  limit: 'tu límite (aún sin compras)',
  none: 'sin datos',
};

interface Props {
  readonly cash: CashFlow;
  readonly groceriesSource: BaselineSource;
  readonly onOpenIncome: () => void;
  readonly onOpenPayments: () => void;
  readonly onOpenBudget: () => void;
  readonly onOpenDebts: () => void;
  readonly onOpenTrips: () => void;
  /**
   * Cuotas de crédito del NEGOCIO que se quedaron fuera de este plan.
   *
   * Llega desde fuera porque solo la pantalla sabe si se está mirando el plan
   * personal o el completo; la tarjeta se limita a decirlo cuando lo hay.
   */
  readonly creditsBusinessExcluded?: number;
}

interface Row {
  key: string;
  emoji: string;
  label: string;
  hint: string;
  /**
   * Se enseña también en móvil.
   *
   * Las pistas normales son decorativas («renta, servicios, suscripciones») y
   * se esconden en pantallas estrechas. Pero una que EXPLICA por qué la cifra
   * no es la que uno esperaría no es decorativa: sin ella, el número parece un
   * error de la app.
   */
  hintAlways?: boolean;
  amount: number;
  bar: string;
  onClick?: () => void;
}

/**
 * La cascada del mes: de lo que entra a lo que queda libre. Cada barra es
 * proporcional al ingreso, así se ve de un vistazo qué se está comiendo el sueldo.
 */
export default function CashFlowCard({ cash, groceriesSource, onOpenIncome, onOpenPayments, onOpenBudget, onOpenDebts, onOpenTrips, creditsBusinessExcluded = 0 }: Props) {
  const base = Math.max(
    cash.monthlyIncome,
    cash.fixedPayments + cash.groceriesEstimate + cash.otherExpenses + cash.creditPayments,
    1,
  );

  const rows: Row[] = [
    {
      key: 'income',
      emoji: '💼',
      label: 'Ingresos',
      // Un cheque cobrado este mes no es lo mismo que un sueldo: decirlo aquí
      // evita que la cifra se lea como «esto entra todos los meses».
      hint:
        cash.extraMonthly > 0
          ? `incluye ${fmtMoney(cash.extraMonthly)} simulados`
          : cash.oneTimeIncome > 0
            ? `${fmtMoney(cash.recurringIncome)} fijos + ${fmtMoney(cash.oneTimeIncome)} cobrados este mes`
            : 'todo lo que entra al mes',
      amount: cash.monthlyIncome + cash.extraMonthly,
      bar: 'from-sky-300 to-sky-400',
      onClick: onOpenIncome,
    },
    {
      key: 'fixed',
      emoji: '📄',
      label: 'Pagos fijos',
      hint: 'renta, servicios, suscripciones',
      amount: -cash.fixedPayments,
      bar: 'from-blue-300 to-blue-400',
      onClick: onOpenPayments,
    },
    {
      key: 'groceries',
      emoji: '🛒',
      label: 'Super',
      hint: GROCERY_HINT[groceriesSource],
      amount: -cash.groceriesEstimate,
      bar: 'from-sky-200 to-sky-300',
      onClick: onOpenBudget,
    },
  ];

  // Comer fuera, farmacia, gasolina: su propia fila. Metido dentro de "Super"
  // inflaba una cifra que el usuario compara contra su límite de despensa;
  // fuera de la cascada, simplemente desaparecía del mes.
  if (cash.otherExpenses > 0) {
    rows.push({
      key: 'other',
      emoji: '🍔',
      label: 'Fuera del super',
      hint: 'comida, farmacia, gasolina',
      amount: -cash.otherExpenses,
      bar: 'from-sky-300 to-blue-300',
      onClick: onOpenTrips,
    });
  }

  // Las cuotas de tarjetas y créditos: dinero ya comprometido, con su propia
  // fila para que no se confunda con los recibos fijos.
  if (cash.creditPayments > 0) {
    rows.push({
      key: 'credits',
      emoji: '💳',
      label: 'Tarjetas y créditos',
      // Cuando hay cuotas del negocio fuera del plan hay que DECIRLO. Si no,
      // esta cifra no cuadra con la suma de las tarjetas que se ven en Deudas y
      // parece un error de la app: «me estás metiendo el coche del negocio».
      hint:
        creditsBusinessExcluded > 0
          ? `solo tu parte personal · ${fmtMoney(creditsBusinessExcluded)} del negocio fuera`
          : 'cuotas de tus deudas',
      hintAlways: creditsBusinessExcluded > 0,
      amount: -cash.creditPayments,
      bar: 'from-blue-400 to-blue-500',
      onClick: onOpenDebts,
    });
  }

  if (cash.debtCatchUp > 0) {
    rows.push({
      key: 'debt',
      emoji: '🔴',
      label: 'Ponerse al día',
      hint: 'abono a pagos atrasados',
      amount: -cash.debtCatchUp,
      bar: 'from-blue-400 to-blue-500',
      onClick: onOpenPayments,
    });
  }

  return (
    <section className={`rounded-3xl shadow-sm p-5 ${CARD}`}>
      <h2 className={`text-sm font-black mb-4 ${NUM}`}>💵 Tu mes</h2>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const width = Math.min(100, (Math.abs(row.amount) / base) * 100);
          const Wrapper = row.onClick ? 'button' : 'div';
          return (
            <Wrapper
              key={row.key}
              {...(row.onClick ? { type: 'button' as const, onClick: row.onClick } : {})}
              className="w-full text-left group"
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <span aria-hidden="true">{row.emoji}</span>
                  {row.label}
                  <span className={`font-normal text-slate-400 ${row.hintAlways ? '' : 'hidden sm:inline'}`}>
                    · {row.hint}
                  </span>
                </span>
                <span className={`text-sm font-black tabular-nums ${NUM}`}>
                  {row.amount >= 0 ? '+' : '−'}{fmtMoney(Math.abs(row.amount))}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/80 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-linear-to-r ${row.bar} group-hover:brightness-105`}
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
                />
              </div>
            </Wrapper>
          );
        })}
      </div>

      {/* Resultado */}
      <div className="mt-4 rounded-2xl p-4 flex items-center justify-between gap-3 bg-linear-to-r from-sky-100 to-blue-100">
        <div>
          <p className={`text-[11px] font-bold ${LABEL}`}>
            {cash.available >= 0 ? 'Te queda libre' : 'Te falta cada mes'}
          </p>
          <p className={`text-2xl font-black tabular-nums ${NUM}`}>{fmtMoney(Math.abs(cash.available))}</p>
        </div>
        <div className="text-right">
          <p className={`text-[11px] ${LABEL}`}>Para metas</p>
          <p className={`text-base font-black tabular-nums ${NUM}`}>{fmtMoney(cash.goalsBudget)}</p>
          {cash.unallocated > 0 && (
            <p className="text-[11px] font-semibold text-black">
              {fmtMoney(cash.unallocated)} sin asignar
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
