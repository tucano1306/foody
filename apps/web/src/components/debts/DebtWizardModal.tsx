'use client';

import { useMemo, useState } from 'react';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';
import type { DebtWithProjection } from '@/lib/debt-data';
import type { DebtKind, PayoffStrategy, RatePeriod } from '@/lib/debt-engine';
import { monthsUntilDate, projectDebt, toDateKey } from '@/lib/debt-engine';
import { haptic } from '@/lib/haptic';
import { confettiRain } from '@/lib/fx';
import ModalShell from '@/components/finance/ModalShell';
import ScopePicker from '@/components/ui/ScopePicker';
import SplitBar from './SplitBar';
import { parseMoney, parseDecimal } from '@/lib/money-input';
import {
  BTN_PRIMARY,
  BTN_SOFT,
  fmtMonths,
  fmtMoney,
  KIND_META,
  KIND_ORDER,
  RATE_PERIOD_META,
  STATUS_META,
  STRATEGY_META,
  STRATEGY_ORDER,
} from './debt-ui';

interface Props {
  readonly currency: string;
  readonly onClose: () => void;
  readonly onCreated: (debt: DebtWithProjection) => void;
}

const RATE_PERIODS: readonly RatePeriod[] = ['monthly', 'annual_nominal', 'annual_effective'];
/** Plazos que la gente pide de verdad — tocar uno evita teclear. */
const TERM_PRESETS = [6, 12, 18, 24, 36, 48] as const;

/**
 * Alta de una deuda en tres toques.
 *
 * Cada paso hace UNA pregunta y el siguiente se desbloquea solo cuando tiene
 * respuesta, así que no hace falta explicar nada ni validar al final. Desde que
 * hay saldo y tasa, el panel de abajo muestra la cuota real calculada en vivo:
 * el usuario ve la consecuencia de lo que escribe mientras lo escribe.
 */
export default function DebtWizardModal({ currency, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<DebtKind>('credit_card');
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>('monthly');
  const [strategy, setStrategy] = useState<PayoffStrategy>('fixed_installment');
  const [termMonths, setTermMonths] = useState<number | null>(12);
  const [customPayment, setCustomPayment] = useState('');
  const [dueDay, setDueDay] = useState(1);
  const [businessShare, setBusinessShare] = useState(0);
  const [payoffDate, setPayoffDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balanceNum = parseMoney(balance);
  const rateNum = parseDecimal(rate);
  const customNum = parseMoney(customPayment);
  // `null` en vez de NaN: los lectores nuevos dicen explícitamente «esto no es
  // un número» en lugar de devolver un NaN que se propaga sin que nadie lo mire.
  const hasMoney = balanceNum !== null && balanceNum > 0;
  const hasRate = rateNum !== null && rateNum >= 0;
  const hasCustom = customNum !== null && customNum > 0;

  const projection = useMemo(() => {
    if (!hasMoney || !hasRate) return null;
    return projectDebt({
      balance: balanceNum,
      rate: rateNum,
      ratePeriod,
      strategy,
      termMonths,
      payoffDate: payoffDate || null,
      customPayment: hasCustom ? customNum : null,
      dueDay,
    });
  }, [hasMoney, hasRate, hasCustom, balanceNum, rateNum, ratePeriod, strategy, termMonths, payoffDate, customNum, dueDay]);

  const stepValid = [
    true,
    hasMoney && hasRate && name.trim().length > 0,
    strategy === 'by_date'
      ? payoffDate !== ''
      : strategy !== 'fixed_installment' || termMonths !== null || hasCustom,
  ];
  const canAdvance = stepValid[step];
  const isLast = step === 2;

  function go(next: number) {
    haptic();
    setStep(Math.max(0, Math.min(2, next)));
  }

  async function submit() {
    // El asistente no deja avanzar sin saldo ni tasa; repetirlo aquí es lo que
    // permite garantizar que nunca se manda un hueco al servidor.
    if (balanceNum === null || rateNum === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          kind,
          issuer: issuer.trim() || null,
          currency,
          balance: balanceNum,
          rate: rateNum,
          ratePeriod,
          strategy,
          termMonths: strategy === 'fixed_installment' ? termMonths : null,
          payoffDate: strategy === 'by_date' ? payoffDate : null,
          customPayment: hasCustom ? customNum : null,
          dueDay,
          businessShare,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo guardar');
      }
      const debt = (await res.json()) as DebtWithProjection;
      haptic([12, 30, 12]);
      confettiRain(['📋', '✨']);
      onCreated(debt);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const status = projection ? STATUS_META[projection.status] : null;

  return (
    <ModalShell
      title={['¿Qué debes?', '¿Cuánto y a qué tasa?', '¿Cómo lo pagas?'][step]}
      subtitle={`Paso ${step + 1} de 3`}
      emoji={KIND_META[kind].emoji}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              aria-label="Volver"
              className={`rounded-2xl p-3.5 ${BTN_SOFT}`}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            disabled={!canAdvance || saving}
            onClick={() => (isLast ? submit() : go(step + 1))}
            className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
          >
            {isLast ? (saving ? 'Guardando…' : '✓ Listo') : 'Siguiente'}
          </button>
        </div>
      }
    >
      {/* Progreso: tres puntos, sin texto. Ancho y opacidad en `style` para que
          el paso actual se lea aunque la animación no llegue a correr. */}
      <div className="mb-5 flex justify-center gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 rounded-full bg-sky-500 transition-all duration-300 ease-out"
            style={{ width: i === step ? 28 : 8, opacity: i <= step ? 1 : 0.3 }}
          />
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
          {error}
        </p>
      )}

      {/* El contenido del paso se remonta con `key` y entra con una animación
          CSS. Antes esto era un AnimatePresence en modo "wait", que solo montaba
          el paso nuevo cuando el anterior TERMINABA de salir: si esa salida no
          se completaba, la cabecera decía "Paso 2" y debajo seguían los campos
          del paso 1. Un asistente no puede depender de eso para avanzar. */}
      <div key={step} className="animate-fade-up flex flex-col gap-4">
          {/* ── Paso 1: qué tipo de deuda ── */}
          {step === 0 && (
            <div className="grid grid-cols-3 gap-2.5">
              {KIND_ORDER.map((k) => {
                const meta = KIND_META[k];
                const selected = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      haptic();
                      setKind(k);
                      if (!name.trim()) setName(meta.label);
                      go(1);
                    }}
                    aria-pressed={selected}
                    className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-3xl border-2 transition-all duration-150 active:scale-95 ${
                      selected
                        ? 'border-sky-500 bg-sky-50 shadow-md'
                        : 'border-sky-100 bg-white hover:border-sky-300 hover:shadow-sm'
                    }`}
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">{meta.emoji}</span>
                    <span className="text-xs font-bold text-black">{meta.label}</span>
                    <span className="text-[10px] text-slate-400">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Paso 2: cuánto y a qué tasa ── */}
          {step === 1 && (
            <>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Nombre (ej. Visa Nu)"
                aria-label="Nombre de la deuda"
                className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3.5 text-base font-semibold text-black placeholder-slate-400 transition focus:border-sky-400 focus:outline-none"
              />
              <input
                type="text"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                maxLength={60}
                placeholder="Banco o entidad (opcional)"
                aria-label="Banco o entidad"
                className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-black placeholder-slate-400 transition focus:border-sky-400 focus:outline-none"
              />

              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                  {currency}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0.00"
                  aria-label="Cuánto debes"
                  className="w-full rounded-3xl border-2 border-sky-200 bg-white py-5 pl-16 pr-4 text-right text-3xl font-extrabold text-black transition focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div className="relative">
                <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400">
                  %
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="Tasa de interés"
                  aria-label="Tasa de interés"
                  className="w-full rounded-3xl border-2 border-sky-200 bg-white py-4 pl-5 pr-12 text-2xl font-extrabold text-black placeholder:text-base placeholder:font-semibold placeholder-slate-400 transition focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {RATE_PERIODS.map((p) => {
                  const selected = ratePeriod === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        haptic();
                        setRatePeriod(p);
                      }}
                      aria-pressed={selected}
                      className={`rounded-2xl border px-2 py-3 transition-all duration-150 active:scale-95 ${
                        selected
                          ? 'border-sky-500 bg-sky-500 text-white shadow-md'
                          : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300'
                      }`}
                    >
                      <span className="block text-xs font-bold leading-tight">
                        {RATE_PERIOD_META[p].label}
                      </span>
                      <span
                        className={`block text-[10px] ${selected ? 'text-white/70' : 'text-slate-400'}`}
                      >
                        {RATE_PERIOD_META[p].hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* La tasa real, en cuanto hay con qué calcularla */}
              {projection && projection.monthlyRate > 0 && (
                <p className="rounded-2xl bg-sky-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600">
                  📈 Te cuesta{' '}
                  <span className="font-extrabold text-black">
                    {fmtMoney(projection.monthlyInterest, currency)}
                  </span>{' '}
                  al mes solo en intereses ·{' '}
                  {(projection.annualEffectiveRate * 100).toFixed(1)} % anual real
                </p>
              )}
            </>
          )}

          {/* ── Paso 3: con qué criterio paga ── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {STRATEGY_ORDER.map((s) => {
                  const meta = STRATEGY_META[s];
                  const selected = strategy === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        haptic();
                        setStrategy(s);
                      }}
                      aria-pressed={selected}
                      className={`flex flex-col items-start gap-0.5 rounded-2xl border-2 px-3.5 py-3 text-left transition-all duration-150 active:scale-95 ${
                        selected
                          ? 'border-sky-500 bg-sky-500 text-white shadow-md'
                          : 'border-sky-100 bg-white text-slate-700 hover:border-sky-300'
                      }`}
                    >
                      <span className="text-sm font-bold">
                        <span aria-hidden="true">{meta.emoji}</span> {meta.label}
                      </span>
                      <span className={`text-[10px] ${selected ? 'text-white/75' : 'text-slate-400'}`}>
                        {meta.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {strategy === 'fixed_installment' && (
                <div className="grid grid-cols-3 gap-2">
                  {TERM_PRESETS.map((t) => {
                    const selected = termMonths === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          haptic();
                          setTermMonths(t);
                        }}
                        aria-pressed={selected}
                        className={`rounded-2xl border py-3 text-sm font-bold transition-all duration-150 active:scale-95 ${
                          selected
                            ? 'border-sky-500 bg-sky-500 text-white shadow-md'
                            : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300'
                        }`}
                      >
                        {t} m
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Fecha exacta: el caso de la tarjeta que hay que liquidar antes
                  de que empiecen a cobrar intereses. La cuota se recalcula sola
                  según los meses que queden. */}
              {strategy === 'by_date' && (
                <div>
                  <label htmlFor="debt-payoff-date" className="mb-2 block text-xs font-bold text-slate-600">
                    Debe estar pagada el
                  </label>
                  <input
                    id="debt-payoff-date"
                    type="date"
                    value={payoffDate}
                    min={toDateKey(new Date())}
                    onChange={(e) => setPayoffDate(e.target.value)}
                    className="w-full rounded-2xl border-2 border-sky-200 bg-white px-4 py-3.5 text-base font-bold text-black transition focus:border-sky-400 focus:outline-none"
                  />
                  {payoffDate && projection && (
                    <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                      Quedan {monthsUntilDate(payoffDate)}{' '}
                      {monthsUntilDate(payoffDate) === 1 ? 'mes' : 'meses'} · si un mes abonas de
                      menos, la cuota sube sola al siguiente
                    </p>
                  )}
                </div>
              )}

              {strategy === 'custom' && (
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                    {currency}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={customPayment}
                    onChange={(e) => setCustomPayment(e.target.value)}
                    placeholder="0.00"
                    aria-label="Cuánto pagarás cada mes"
                    className="w-full rounded-3xl border-2 border-sky-200 bg-white py-4 pl-16 pr-4 text-right text-2xl font-extrabold text-black transition focus:border-sky-400 focus:outline-none"
                  />
                </div>
              )}

              {/* Un crédito también puede ser del negocio: préstamo comercial,
                  tarjeta de la empresa, o la mixta que se usa para las dos cosas. */}
              <ScopePicker
                value={businessShare}
                onChange={setBusinessShare}
                amount={projection?.installment}
                currency={currency}
                label="¿De quién es esta deuda?"
              />

              {/* Día de corte. Los atajos son eso —atajos—: el campo de al lado
                  acepta cualquier día del 1 al 31, porque los cortes reales no
                  caen solo en números redondos. */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-600">Día de pago</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    value={dueDay}
                    onChange={(e) => {
                      const n = Math.trunc(Number(e.target.value));
                      if (Number.isFinite(n)) setDueDay(Math.min(31, Math.max(1, n)));
                    }}
                    aria-label="Día de pago del mes"
                    className="w-20 rounded-xl border-2 border-sky-200 bg-white px-3 py-2 text-center text-base font-bold text-black transition focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 5, 10, 15, 20, 25, 28, 30].map((d) => {
                    const selected = dueDay === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          haptic();
                          setDueDay(d);
                        }}
                        aria-pressed={selected}
                        className={`h-11 w-11 rounded-full text-sm font-bold transition-all duration-150 active:scale-90 ${
                          selected
                            ? 'bg-sky-500 text-white shadow-md'
                            : 'bg-white text-slate-600 ring-1 ring-sky-200 hover:ring-sky-300'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Consecuencia en vivo de lo que acaba de elegir */}
              {projection && status && (
                <div className="rounded-3xl bg-sky-50/80 p-4">
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600">Pagarías al mes</span>
                    <span className="text-2xl font-extrabold text-black">
                      {fmtMoney(projection.installment, currency)}
                    </span>
                  </div>

                  <SplitBar
                    interest={projection.firstSplit.interest}
                    principal={projection.firstSplit.principal}
                    currency={currency}
                  />

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-sky-200/70 pt-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.chip}`}>
                      {status.emoji} {status.label}
                    </span>
                    <span className="text-right text-xs font-semibold text-slate-600">
                      {projection.neverPaysOff ? (
                        <span className="font-extrabold text-blue-800">
                          Nunca terminas de pagarla
                        </span>
                      ) : (
                        <>
                          Libre en{' '}
                          <span className="font-extrabold text-black">
                            {fmtMonths(projection.monthsToPayoff)}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {fmtMoney(projection.totalInterest, currency)} de interés total
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
      </div>
    </ModalShell>
  );
}
