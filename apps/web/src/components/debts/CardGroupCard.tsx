'use client';

import type { MouseEvent } from 'react';
import type { CardStatementInfo, DebtWithProjection } from '@/lib/debt-data';
import { cardTitle, ultimosDeLaTarjeta } from '@/lib/card-payment';
import type { CondicionesDeCredito } from '@/lib/condiciones-credito';
import { haptic } from '@/lib/haptic';
import BotonMas from './BotonMas';
import ChipDeCuenta from './ChipDeCuenta';
import MinimoDeLaTarjeta from './MinimoDeLaTarjeta';
import TramosDeTarjeta from './TramosDeTarjeta';
import { BTN_PRIMARY, fmtMoney, fmtMoneyShort } from './debt-ui';

interface Props {
  /** Los tramos de la tarjeta, ya filtrados por ámbito. */
  readonly tramos: readonly DebtWithProjection[];
  /** Abre la tarjeta entera: su hoja con los saldos y el historial. */
  readonly onOpen?: () => void;
  readonly onOpenTramo: (id: string) => void;
  readonly onPay: () => void;
  /** El último estado de cuenta guardado de esta tarjeta. */
  readonly estado?: CardStatementInfo | null;
  /** Las condiciones de su banco: con ellas, el mínimo sin cubrir dice lo que cuesta. */
  readonly condiciones?: CondicionesDeCredito | null;
  /**
   * Abre el menú «⋯» de la tarjeta: cuadrar, condiciones del banco, pasar a
   * Metas y borrar. Lo arma DebtsView, que es quien tiene cada hoja.
   */
  readonly onMenu?: () => void;
}

/**
 * Una tarjeta con varios tramos: el plástico arriba, sus saldos dentro.
 *
 * Antes cada tramo era una tarjeta suelta en la lista, y nada decía que
 * «Compras 3650» y «Unlimited Cash 3650» se pagan con el mismo mínimo. Ahora
 * se ven juntas, cada una con su tasa, y el abono se hace a la tarjeta.
 *
 * Se toca por cualquier sitio para entrar, como una deuda suelta. Antes solo
 * respondían sus tramos y sus botones: tocar la cabecera o el mínimo no hacía
 * nada, y la tarjeta parecía rota al lado de las demás. No puede ser un
 * `<button>` entero porque lleva botones dentro (los tramos, abonar, «⋯»);
 * por eso la cabecera es el botón de verdad —para el teclado y el lector de
 * pantalla— y el resto de la superficie le pasa el toque.
 */
export default function CardGroupCard({ tramos, onOpen, onOpenTramo, onPay, estado = null, condiciones = null, onMenu }: Props) {
  const currency = tramos[0]?.currency ?? 'USD';
  const titulo = cardTitle(tramos);
  const total = tramos.reduce((s, t) => s + t.currentBalance, 0);
  const interesMes = tramos.reduce((s, t) => s + t.projection.monthlyInterest, 0);
  const ordenados = [...tramos].sort((a, b) => b.currentBalance - a.currentBalance);

  const abrir = () => {
    if (!onOpen) return;
    haptic();
    onOpen();
  };

  /**
   * Un toque en la superficie abre la tarjeta; uno en un control de dentro es
   * de ese control. Se mira el destino real del toque y no se para la
   * propagación en cada hijo: así un botón nuevo que se añada mañana no abre
   * la tarjeta por accidente.
   */
  const alTocarLaSuperficie = (e: MouseEvent<HTMLDivElement>) => {
    const destino = e.target as HTMLElement;
    if (destino.closest('button, a, input, select, textarea, [role="button"]')) return;
    abrir();
  };

  const cabecera = (
    <>
      <ChipDeCuenta ultimos={ultimosDeLaTarjeta(tramos)} />
      <span className="min-w-0 flex-1">
        {/* Sin `truncate`: a 375px cortaba en «Bank of Ame…» y se perdía
            justo lo que distingue la tarjeta, los últimos dígitos. */}
        <span className="block text-base font-bold leading-tight text-black">{titulo}</span>
        <span className="block text-xs text-slate-500">
          {tramos.length} tramos · un solo mínimo
          {interesMes > 0 && <> · {fmtMoney(interesMes, currency)} de interés al mes</>}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xl font-extrabold leading-tight text-black">{fmtMoneyShort(total, currency)}</span>
        <span className="block text-[11px] text-slate-400">debes hoy</span>
      </span>
    </>
  );

  const encabezado = onOpen ? (
    <button
      type="button"
      onClick={abrir}
      aria-label={`Abrir ${titulo} · debes ${fmtMoney(total, currency)}`}
      className="-m-2 flex items-center gap-3 rounded-2xl p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {cabecera}
    </button>
  ) : (
    <div className="flex items-center gap-3">{cabecera}</div>
  );

  return (
    // `data-accion` marca lo que tiene su propio toque: al apretarlo, la
    // tarjeta no se hunde, para que no parezca que se va a abrir entera.
    <div
      onClick={onOpen ? alTocarLaSuperficie : undefined}
      className={`flex flex-col gap-4 rounded-3xl border border-sky-100 bg-white p-5 shadow-sm transition-all duration-200 sm:col-span-2${
        onOpen ? ' cursor-pointer hover:shadow-md [&:active:not(:has([data-accion]_:active))]:scale-[0.99]' : ''
      }`}
    >
      {encabezado}

      <MinimoDeLaTarjeta tramos={tramos} estado={estado} condiciones={condiciones} />

      <div data-accion>
        <TramosDeTarjeta
          titulo={titulo}
          tramos={ordenados.map((t) => ({ ...t, balance: t.currentBalance }))}
          formatoSaldo={(t) => fmtMoney(t.balance, t.currency)}
          onOpen={(id) => {
            haptic();
            onOpenTramo(id);
          }}
        />
      </div>

      {/* Abonar es lo de cada mes y va a la vista; lo demás (cuadrar, las
          condiciones del banco, pasar a Metas, borrar) vive en «⋯». Antes eran
          líneas de texto sueltas debajo de la tarjeta, y cada acción nueva la
          alargaba un poco más. */}
      <div data-accion className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => {
            haptic();
            onPay();
          }}
          className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_PRIMARY}`}
        >
          💸 Abonar a la tarjeta
        </button>
        {onMenu && <BotonMas onClick={onMenu} de={titulo} />}
      </div>
    </div>
  );
}
