'use client';

import { motion } from 'framer-motion';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import type { CashFlow } from '@/lib/finance-engine';
import { CARD, LABEL, NUM, fmtMoney, palabraDelResto } from './finance-ui';

/**
 * Por debajo de medio dólar una cifra se pinta «$0»: «y $0 previstos» o «$0
 * del negocio fuera» es ruido de redondeo, no información.
 */
const VISIBLE = 0.5;

interface Props {
  readonly cash: CashFlow;
  readonly onOpenIncome: () => void;
  readonly onOpenPayments: () => void;
  readonly onOpenBudget: () => void;
  readonly onOpenDebts: () => void;
  readonly onOpenTrips: () => void;
  /**
   * Mínimos de crédito del NEGOCIO que se quedaron fuera de este plan.
   *
   * Llega desde fuera porque solo la pantalla sabe si se está mirando el plan
   * personal o el completo; la tarjeta se limita a decirlo cuando lo hay.
   */
  readonly creditsBusinessExcluded?: number;
  /**
   * Lo gastado este mes en super y fuera del super que es del NEGOCIO y este
   * plan no cuenta. La tarjeta de comida, debajo, enseña el gasto entero: sin
   * decirlo aquí, «Llevas» no cuadraría entre las dos.
   */
  readonly groceriesBusinessExcluded?: number;
  readonly otherBusinessExcluded?: number;
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
  /** Lo que resta la cascada, con su signo. */
  amount: number;
  /**
   * Para un gasto que se va llenando durante el mes: lo que ya salió de la
   * cuenta. La fila enseña ESTO, y lo que falta hasta `amount` va debajo como
   * previsto.
   *
   * La fila del super decía la cifra del mes entero y la tarjeta de comida,
   * justo debajo, «Llevas» con otra: el dueño leyó que la app sumaba mal. Con
   * las dos cifras a la vista, cada una dice lo suyo y la cascada sigue
   * cuadrando con lo libre.
   */
  spent?: number;
  bar: string;
  onClick?: () => void;
}

/** «solo tu parte · $X del negocio fuera»: la misma frase en las tres filas. */
function soloTuParte(fuera: number): string {
  return `solo tu parte personal · ${fmtMoney(fuera)} del negocio fuera`;
}

/** A dónde va lo libre, una vez cubierto lo que pide el mes. */
interface Destino {
  key: string;
  emoji: string;
  label: string;
  amount: number;
  onClick: () => void;
}

/**
 * La cascada del mes: de lo que entra a lo que queda libre. Cada barra es
 * proporcional al ingreso, así se ve de un vistazo qué se está comiendo el sueldo.
 *
 * La cascada para en lo que PIDE el mes; lo que el plan hace después con lo
 * libre —abonar de más a una tarjeta, ponerse al día, las metas— va debajo,
 * cada cosa con su cifra. Todo junto en la cascada, liquidar un 0 % a tiempo se
 * leía como un gasto del mes que no cabía.
 */
export default function CashFlowCard({
  cash,
  onOpenIncome,
  onOpenPayments,
  onOpenBudget,
  onOpenDebts,
  onOpenTrips,
  creditsBusinessExcluded = 0,
  groceriesBusinessExcluded = 0,
  otherBusinessExcluded = 0,
}: Props) {
  const base = Math.max(
    cash.monthlyIncome,
    cash.fixedPayments + cash.groceriesEstimate + cash.otherExpenses + cash.creditMinimums,
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
      hint: groceriesBusinessExcluded >= VISIBLE ? soloTuParte(groceriesBusinessExcluded) : 'despensa',
      hintAlways: groceriesBusinessExcluded >= VISIBLE,
      amount: -cash.groceriesEstimate,
      spent: cash.groceriesSpent,
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
      hint: otherBusinessExcluded >= VISIBLE ? soloTuParte(otherBusinessExcluded) : 'comida, farmacia, gasolina',
      hintAlways: otherBusinessExcluded >= VISIBLE,
      amount: -cash.otherExpenses,
      spent: cash.otherSpent,
      bar: 'from-sky-300 to-blue-300',
      onClick: onOpenTrips,
    });
  }

  // Tarjetas y créditos: lo que EXIGE el banco —los mínimos, y la cuota de un
  // préstamo—, con su propia fila para que no se confunda con los recibos.
  if (cash.creditMinimums > 0) {
    rows.push({
      key: 'credits',
      emoji: '💳',
      label: 'Tarjetas y créditos',
      // Cuando hay mínimos del negocio fuera del plan hay que DECIRLO. Si no,
      // esta cifra no cuadra con la suma de las tarjetas que se ven en Deudas y
      // parece un error de la app: «me estás metiendo el coche del negocio».
      hint: creditsBusinessExcluded > 0 ? soloTuParte(creditsBusinessExcluded) : 'lo que pide el banco',
      hintAlways: creditsBusinessExcluded > 0,
      amount: -cash.creditMinimums,
      bar: 'from-blue-400 to-blue-500',
      onClick: onOpenDebts,
    });
  }

  const destinos: Destino[] = [];
  // Lo que el plan abona por encima del mínimo, casi siempre para llegar a
  // cero antes de que acabe un 0 %. Con su nombre y su cifra: quien sabe lo
  // que manda a su tarjeta tiene que encontrarlo aquí.
  if (cash.creditPlanExtra > 0) {
    destinos.push({
      key: 'plan',
      emoji: '🎯',
      label: 'Abonos de más a tarjetas',
      amount: cash.creditPlanExtra,
      onClick: onOpenDebts,
    });
  }
  // La reserva para lo atrasado sale de lo libre, como el plan de las
  // tarjetas: dentro de la cascada, la suma de las filas no daba lo libre.
  if (cash.debtCatchUp > 0) {
    destinos.push({
      key: 'debt',
      emoji: '⏳',
      label: 'Ponerse al día',
      amount: cash.debtCatchUp,
      onClick: onOpenPayments,
    });
  }

  return (
    <section className={`rounded-3xl shadow-sm p-5 ${CARD}`}>
      <h2 className={`text-sm font-black mb-4 ${NUM}`}>💵 Tu mes</h2>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const total = Math.abs(row.amount);
          const width = Math.min(100, (total / base) * 100);
          // Lo que la fila enseña: lo gastado si es un gasto que se va llenando,
          // y si no la cifra entera. Lo previsto es lo que falta hasta lo que
          // resta la cascada.
          const shown = row.spent ?? total;
          const previsto = row.spent === undefined ? 0 : Math.max(0, total - row.spent);
          const spentWidth = Math.min(100, (shown / base) * 100);
          const Wrapper = row.onClick ? 'button' : 'div';
          const ease = [0.22, 0.61, 0.36, 1] as const;
          return (
            <Wrapper
              key={row.key}
              {...(row.onClick ? { type: 'button' as const, onClick: row.onClick } : {})}
              className="w-full text-left group"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="min-w-0 text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <span aria-hidden="true">{row.emoji}</span>
                  {row.label}
                  <span className={`font-normal text-slate-400 ${row.hintAlways ? '' : 'hidden sm:inline'}`}>
                    · {row.hint}
                  </span>
                </span>
                {/* Sin `nowrap`, una pista larga («solo tu parte personal…»)
                    partía la cifra en «−» y «$240» en dos líneas. */}
                <span className={`shrink-0 whitespace-nowrap text-sm font-black tabular-nums ${NUM}`}>
                  {/* El día 1, sin compras, «−$0» parece un error de signo. */}
                  {Math.round(shown) === 0 ? '' : row.amount >= 0 ? '+' : '−'}{fmtMoney(shown)}
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-white/80 overflow-hidden">
                {/* Lo previsto, translúcido debajo de lo gastado: el mismo
                    lenguaje que el ritmo de las tarjetas de comida. */}
                {row.spent !== undefined && (
                  <motion.div
                    className={`absolute inset-y-0 left-0 rounded-full bg-linear-to-r ${row.bar} opacity-50`}
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.8, delay: i * 0.08, ease }}
                  />
                )}
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-full bg-linear-to-r ${row.bar} group-hover:brightness-105`}
                  initial={{ width: 0 }}
                  animate={{ width: `${spentWidth}%` }}
                  transition={{ duration: 0.8, delay: i * 0.08, ease }}
                />
              </div>
              {previsto >= VISIBLE && (
                <p className={`mt-1 text-right text-[11px] tabular-nums ${LABEL}`}>
                  y {fmtMoney(previsto)} previstos hasta fin de mes
                </p>
              )}
            </Wrapper>
          );
        })}
      </div>

      {/* Resultado: lo que queda tras lo que pide el mes, y a dónde va */}
      <div className="mt-4 rounded-2xl p-4 bg-linear-to-r from-sky-100 to-blue-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-[11px] font-bold ${LABEL}`}>{palabraDelResto(cash, 'Te queda libre')}</p>
            <p className={`text-2xl font-black tabular-nums ${NUM}`}>{fmtMoney(Math.abs(cash.afterObligations))}</p>
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

        {destinos.length > 0 && (
          <ul className="mt-3 border-t border-sky-200 pt-2">
            {destinos.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={d.onClick}
                  className="flex w-full items-center gap-2 py-1.5 text-left"
                >
                  <span aria-hidden="true">{d.emoji}</span>
                  <span className={`min-w-0 flex-1 text-xs font-bold ${LABEL}`}>{d.label}</span>
                  <span className={`text-sm font-black tabular-nums ${NUM}`}>{fmtMoney(d.amount)}</span>
                  <ChevronRightIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
