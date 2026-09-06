'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import ModalShell from './ModalShell';
import ScopePicker from '@/components/ui/ScopePicker';
import {
  monthlyEquivalent,
  monthsElapsedThisYear,
  totalMonthlyIncome,
  totalOneTimeIncome,
  type IncomeFrequency,
  type IncomeSource,
} from '@/lib/finance-engine';
import { parseMoney } from '@/lib/money-input';
import { FREQUENCY_LABEL, fmtMoney, fmtMoneyFine } from './finance-ui';

export interface IncomePayload {
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  isActive: boolean;
  /** 0-100: qué parte de este ingreso es facturación del negocio. */
  businessShare: number;
  /** Día en que entró el dinero, YYYY-MM-DD. Solo para los sueltos. */
  receivedOn: string | null;
}

interface Props {
  readonly incomes: readonly IncomeSource[];
  readonly onCreate: (payload: IncomePayload) => Promise<void>;
  readonly onToggle: (id: string, isActive: boolean) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * `one_time` estaba en el motor, en la validación y hasta con etiqueta escrita,
 * pero no en esta lista: quien cobra por trabajos —hoy un cheque, mañana otro—
 * no tenía dónde meterlo y acababa poniéndolo como «Mensual», que promete todos
 * los meses un dinero que entró una vez.
 */
const FREQUENCIES: readonly IncomeFrequency[] = ['monthly', 'biweekly', 'weekly', 'yearly', 'ytd', 'one_time'];

/** Las dos que no son una tasa fija se llevan la fila entera y se explican. */
const WIDE_LABEL: Partial<Record<IncomeFrequency, string>> = {
  ytd: '📅 Lo que llevo cobrado este año',
  one_time: '💵 Un cheque o pago suelto',
};

/** Hoy en YYYY-MM-DD, en hora local: `toISOString` corre el día por la tarde. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "24/09/2027" a partir de un YYYY-MM-DD, sin pasar por Date (que corre el día). */
function fmtDay(key: string | null | undefined): string {
  const m = (key ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'sin fecha';
}

/** ¿Este suelto entra en el mes que se está mirando? */
function countsNow(inc: IncomeSource): boolean {
  return totalOneTimeIncome([inc]) > 0;
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-sky-200 bg-white/70 text-black text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 transition';

export default function IncomeModal({ incomes, onCreate, onToggle, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly');
  const [receivedOn, setReceivedOn] = useState(today());
  const [businessShare, setBusinessShare] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOneTime = frequency === 'one_time';
  const recurring = totalMonthlyIncome(incomes);
  const oneTime = totalOneTimeIncome(incomes);
  const elapsed = monthsElapsedThisYear();
  const year = new Date().getFullYear();

  const pendingAmount = parseMoney(amount);
  /** Hay algo escrito que todavía no se ha guardado. */
  const pending = name.trim() !== '' || pendingAmount !== null;

  /** @returns true si quedó guardado (o no había nada que guardar). */
  async function add(): Promise<boolean> {
    const value = parseMoney(amount);
    if (!name.trim()) { setError('Ponle un nombre (ej. Sueldo)'); return false; }
    if (value === null || value <= 0) { setError('El monto debe ser mayor a 0'); return false; }

    setError(null);
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        amount: value,
        frequency,
        isActive: true,
        businessShare,
        receivedOn: isOneTime ? receivedOn : null,
      });
      setName('');
      setAmount('');
      setReceivedOn(today());
      setBusinessShare(0);
      haptic([10, 20, 10]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * «Listo» guarda lo que haya escrito antes de cerrar.
   *
   * Era el botón más visible del modal y solo cerraba: quien rellenaba el
   * formulario y lo pulsaba —lo natural, está abajo a la derecha y es el único
   * azul del pie— veía cómo su ingreso se perdía sin un solo aviso, y la
   * pantalla seguía diciendo INGRESO $0. Si lo escrito no es válido, no se
   * cierra: se explica por qué.
   */
  async function done() {
    if (pending && !(await add())) return;
    onClose();
  }

  return (
    <ModalShell
      title="Tus ingresos"
      emoji="💼"
      headerClass="from-sky-100 to-blue-100"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500 font-bold">
              {oneTime > 0 ? 'Entra este mes' : 'Total mensual'}
            </p>
            <p className="text-xl font-black text-black tabular-nums">{fmtMoney(recurring + oneTime)}</p>
            {oneTime > 0 && (
              <p className="text-[11px] text-slate-500">
                {fmtMoney(recurring)} fijos + {fmtMoney(oneTime)} de una sola vez
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void done()}
            disabled={busy}
            className="px-6 py-3 rounded-2xl bg-linear-to-r from-sky-500 to-blue-500 text-white font-bold text-sm shadow-lg shadow-sky-500/20 disabled:opacity-50"
          >
            {pending ? 'Guardar y cerrar' : 'Listo'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Lista */}
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {incomes.map((inc) => (
              <motion.div
                key={inc.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
                  inc.isActive
                    ? 'bg-sky-50/70 border-sky-200'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => { haptic(8); void onToggle(inc.id, !inc.isActive); }}
                  aria-label={inc.isActive ? 'Desactivar' : 'Activar'}
                  className={`relative w-10 h-6 rounded-full shrink-0 transition ${
                    inc.isActive ? 'bg-sky-400' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      inc.isActive ? 'left-[18px]' : 'left-0.5'
                    }`}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-black truncate">{inc.name}</p>
                  {/* Un suelto no tiene equivalente mensual: decir «→ $0/mes»
                      sería exacto y del todo inútil. De un cheque lo que importa
                      es el día en que entró y si cae en el mes en curso. */}
                  <p className="text-[11px] text-slate-500">
                    {fmtMoney(inc.amount)} · {FREQUENCY_LABEL[inc.frequency]}
                    {inc.frequency === 'one_time'
                      ? ` · ${fmtDay(inc.receivedOn)}${countsNow(inc) ? '' : ' · otro mes'}`
                      : inc.frequency !== 'monthly' &&
                        (inc.frequency === 'ytd'
                          ? ` ÷ ${elapsed} meses → ${fmtMoneyFine(monthlyEquivalent(inc.amount, inc.frequency))}/mes`
                          : ` → ${fmtMoney(monthlyEquivalent(inc.amount, inc.frequency))}/mes`)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { haptic(14); void onDelete(inc.id); }}
                  aria-label={`Eliminar ${inc.name}`}
                  className="p-2 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition shrink-0"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {incomes.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-6">
              Aún no registras ingresos. Agrega el primero abajo 👇
            </p>
          )}
        </div>

        {/* Alta */}
        <div className="rounded-2xl border border-dashed border-sky-300 bg-sky-50/40 p-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sueldo"
              className={inputCls}
              maxLength={120}
            />
            <div className="relative w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
              {/* `text` y no `number`: el campo numérico del navegador usa
                  siempre el punto como decimal, así que al escribir «54.587,19»
                  se quedaba con «54.587» y tiraba el resto sin avisar — el
                  sueldo entraba mil veces más pequeño. Ver money-input.ts. */}
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="3000"
                aria-label="Monto"
                className={`${inputCls} pl-7 font-bold`}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {FREQUENCIES.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFrequency(f); haptic(6); }}
                className={`py-2 rounded-xl text-[11px] font-bold transition ${
                  WIDE_LABEL[f] ? 'col-span-4' : ''
                } ${
                  frequency === f
                    ? 'bg-sky-100 text-sky-700 ring-2 ring-sky-200'
                    : 'bg-white text-slate-500 border border-sky-200'
                }`}
              >
                {WIDE_LABEL[f] ?? FREQUENCY_LABEL[f]}
              </button>
            ))}
          </div>

          {/* Un acumulado del año no se divide entre 12: se divide entre los
              meses que HAN pasado. Se enseña la cuenta entera —cifra, divisor y
              resultado— porque es un número que cambia solo al pasar de mes, y
              verlo salir evita que parezca que la app se lo inventa. */}
          {frequency === 'ytd' && (
            <p className="rounded-xl bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              De enero al día de hoy han pasado <strong>{elapsed} meses de {year}</strong>.
              {pendingAmount !== null && pendingAmount > 0 ? (
                <>
                  {' '}
                  {fmtMoneyFine(pendingAmount)} ÷ {elapsed} ={' '}
                  <strong>{fmtMoneyFine(pendingAmount / elapsed)} al mes</strong>.
                </>
              ) : (
                ' Lo que escribas se repartirá entre esos meses, no entre 12.'
              )}
            </p>
          )}

          {/* La fecha solo aparece cuando cambia algo: es lo que decide en qué
              mes cuenta el cheque, y en cuál deja de contar. */}
          {isOneTime && (
            <div>
              <label htmlFor="income-received-on" className="mb-1 block text-[11px] font-bold text-slate-500">
                ¿Qué día lo cobraste?
              </label>
              <input
                id="income-received-on"
                type="date"
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {/* De dónde sale este dinero. Importa para las metas: si la
              facturación del negocio va a financiarlas o no es una decisión del
              usuario, y el plan la respeta con su interruptor. */}
          <ScopePicker
            value={businessShare}
            onChange={setBusinessShare}
            amount={parseMoney(amount) ?? undefined}
            label="¿De dónde viene?"
          />

          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            <PlusIcon className="w-4 h-4" />
            {busy ? 'Agregando…' : 'Agregar ingreso'}
          </button>

          {error && <p className="text-xs font-semibold text-blue-600">{error}</p>}
        </div>
      </div>
    </ModalShell>
  );
}
