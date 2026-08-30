'use client';

import { useMemo, useState } from 'react';
import type { DebtWithProjection } from '@/lib/debt-data';
import type { DebtKind, PayoffStrategy, RatePeriod } from '@/lib/debt-engine';
import { monthsUntilDate, projectDebt, toDateKey } from '@/lib/debt-engine';
import { haptic } from '@/lib/haptic';
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
  readonly debt: DebtWithProjection;
  readonly onClose: () => void;
  readonly onSaved: (debt: DebtWithProjection) => void;
}

const RATE_PERIODS: readonly RatePeriod[] = ['monthly', 'annual_nominal', 'annual_effective'];
const TERM_PRESETS = [6, 12, 18, 24, 36, 48] as const;

const inputCls =
  'w-full rounded-2xl border-2 border-sky-200 bg-white px-4 py-3 text-base font-semibold text-black transition focus:border-sky-400 focus:outline-none';

/**
 * Editar una deuda: TODO es modificable y todo se escribe a mano.
 *
 * Los atajos (plazos de 12/24/36, días redondos) son solo eso —atajos—; al lado
 * de cada uno hay un campo libre, porque los créditos reales no vienen en
 * números redondos. El único dato que NO se toca aquí es el saldo: ese se
 * corrige con un ajuste en el libro mayor, para que el historial siga cuadrando
 * con la cifra (ver «Corregir saldo» en la hoja de detalle).
 */
export default function DebtEditModal({ debt, onClose, onSaved }: Props) {
  const [name, setName] = useState(debt.name);
  const [issuer, setIssuer] = useState(debt.issuer ?? '');
  const [kind, setKind] = useState<DebtKind>(debt.kind);
  const [last4, setLast4] = useState(debt.accountLast4 ?? '');
  const [rate, setRate] = useState(String(debt.rate));
  const [ratePeriod, setRatePeriod] = useState<RatePeriod>(debt.ratePeriod);
  const [strategy, setStrategy] = useState<PayoffStrategy>(debt.strategy);
  const [termMonths, setTermMonths] = useState<number | null>(debt.termMonths);
  const [payoffDate, setPayoffDate] = useState(debt.payoffDate ?? '');
  const [customPayment, setCustomPayment] = useState(
    debt.customPayment != null ? String(debt.customPayment) : '',
  );
  const [minPercent, setMinPercent] = useState(
    debt.minPercent != null ? String(debt.minPercent) : '',
  );
  const [dueDay, setDueDay] = useState(debt.dueDay);
  const [promoEndsOn, setPromoEndsOn] = useState(debt.promoEndsOn ?? '');
  const [rateAfterPromo, setRateAfterPromo] = useState(
    debt.rateAfterPromo != null ? String(debt.rateAfterPromo) : '',
  );
  const [cycleDays, setCycleDays] = useState(debt.cycleDays != null ? String(debt.cycleDays) : '');
  const [creditLimit, setCreditLimit] = useState(
    debt.creditLimit != null ? String(debt.creditLimit) : '',
  );
  const [extraMonthly, setExtraMonthly] = useState(
    debt.extraMonthly > 0 ? String(debt.extraMonthly) : '',
  );
  const [businessShare, setBusinessShare] = useState(debt.businessShare);
  const [note, setNote] = useState(debt.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rateNum = parseDecimal(rate);
  const customNum = parseMoney(customPayment);
  const extraNum = parseMoney(extraMonthly);
  // `null` es «no escribió nada»; distinguirlo de 0 evita mandar huecos.
  const hasCustom = customNum !== null && customNum > 0;
  const hasExtra = extraNum !== null && extraNum > 0;

  /** La consecuencia de cada cambio, en vivo y con el saldo real. */
  const projection = useMemo(
    () =>
      projectDebt({
        balance: debt.currentBalance,
        rate: rateNum ?? 0,
        ratePeriod,
        strategy,
        termMonths,
        payoffDate: payoffDate || null,
        customPayment: hasCustom ? customNum : null,
        minPercent: parseDecimal(minPercent) || null,
        minFloor: debt.minFloor,
        extraMonthly: extraNum ?? 0,
      }),
    [debt.currentBalance, debt.minFloor, rateNum, ratePeriod, strategy, termMonths, payoffDate, customNum, minPercent, extraNum],
  );

  const status = STATUS_META[projection.status];
  const valid =
    name.trim().length > 0 &&
    rateNum !== null &&
    rateNum >= 0 &&
    (strategy !== 'by_date' || payoffDate !== '');

  async function save() {
    if (!valid) {
      setError(
        strategy === 'by_date' && !payoffDate
          ? 'Indica la fecha en que debe estar pagada'
          : 'Revisa el nombre y la tasa',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/debts/${debt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          issuer: issuer.trim() || null,
          kind,
          accountLast4: last4.trim() || null,
          rate: rateNum,
          ratePeriod,
          strategy,
          termMonths: strategy === 'fixed_installment' ? termMonths : null,
          payoffDate: strategy === 'by_date' ? payoffDate : null,
          customPayment: hasCustom ? customNum : null,
          minPercent: parseDecimal(minPercent) || null,
          extraMonthly: hasExtra ? extraNum : 0,
          // La fecha sin la tasa posterior no sirve de nada: se manda el par o
          // no se manda ninguno.
          promoEndsOn: promoEndsOn || null,
          rateAfterPromo: promoEndsOn ? parseDecimal(rateAfterPromo) : null,
          cycleDays: parseDecimal(cycleDays) || null,
          creditLimit: parseMoney(creditLimit) || null,
          dueDay,
          businessShare,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo guardar');
      }
      haptic([12, 30, 12]);
      onSaved((await res.json()) as DebtWithProjection);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Editar deuda"
      subtitle={debt.name}
      emoji={KIND_META[kind].emoji}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className={`flex-1 rounded-2xl py-3.5 text-sm ${BTN_SOFT}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !valid}
            className={`flex-[2] rounded-2xl py-3.5 text-sm ${BTN_PRIMARY} disabled:opacity-40`}
          >
            {saving ? 'Guardando…' : '✓ Guardar cambios'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800">
            {error}
          </p>
        )}

        {/* Identidad */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Nombre"
          aria-label="Nombre de la deuda"
          className={inputCls}
        />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            maxLength={60}
            placeholder="Banco o entidad"
            aria-label="Banco o entidad"
            className={inputCls}
          />
          <input
            type="text"
            inputMode="numeric"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replaceAll(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            maxLength={4}
            aria-label="Últimos 4 dígitos"
            className={`${inputCls} w-24 text-center font-mono`}
          />
        </div>

        {/* Tipo */}
        <div className="grid grid-cols-4 gap-2">
          {KIND_ORDER.map((k) => {
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => { haptic(); setKind(k); }}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 transition active:scale-95 ${
                  selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-200 bg-white text-slate-700'
                }`}
              >
                <span className="text-base leading-none" aria-hidden="true">{KIND_META[k].emoji}</span>
                <span className="text-[10px] font-bold leading-tight">{KIND_META[k].label}</span>
              </button>
            );
          })}
        </div>

        {/* Tasa */}
        <div>
          <label htmlFor="edit-rate" className="mb-2 block text-xs font-bold text-slate-600">
            Tasa de interés
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">%</span>
            <input
              id="edit-rate"
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className={`${inputCls} pr-12 text-xl font-extrabold`}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {RATE_PERIODS.map((p) => {
              const selected = ratePeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { haptic(); setRatePeriod(p); }}
                  aria-pressed={selected}
                  className={`rounded-2xl border px-2 py-2.5 text-xs font-bold transition active:scale-95 ${
                    selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-200 bg-white text-slate-700'
                  }`}
                >
                  {RATE_PERIOD_META[p].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Estrategia */}
        <div>
          <p className="mb-2 text-xs font-bold text-slate-600">¿Cómo la pagas?</p>
          <div className="grid grid-cols-2 gap-2">
            {STRATEGY_ORDER.map((s) => {
              const selected = strategy === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { haptic(); setStrategy(s); }}
                  aria-pressed={selected}
                  className={`flex flex-col items-start gap-0.5 rounded-2xl border-2 px-3 py-2.5 text-left transition active:scale-95 ${
                    selected ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-100 bg-white text-slate-700'
                  }`}
                >
                  <span className="text-xs font-bold">
                    <span aria-hidden="true">{STRATEGY_META[s].emoji}</span> {STRATEGY_META[s].label}
                  </span>
                  <span className={`text-[10px] ${selected ? 'text-white/75' : 'text-slate-400'}`}>
                    {STRATEGY_META[s].hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Plazo: atajos + campo libre, porque no todos los créditos son a 12 o 24 */}
        {strategy === 'fixed_installment' && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-600">Plazo en meses</p>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={termMonths ?? ''}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  setTermMonths(Number.isFinite(n) && n > 0 ? Math.min(600, n) : null);
                }}
                aria-label="Plazo en meses"
                className={`${inputCls} w-24 text-center`}
              />
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {TERM_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { haptic(); setTermMonths(t); }}
                  aria-pressed={termMonths === t}
                  className={`rounded-xl border py-2 text-xs font-bold transition active:scale-95 ${
                    termMonths === t ? 'border-sky-500 bg-sky-500 text-white' : 'border-sky-200 bg-white text-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {strategy === 'by_date' && (
          <div>
            <label htmlFor="edit-payoff" className="mb-2 block text-xs font-bold text-slate-600">
              Debe estar pagada el
            </label>
            <input
              id="edit-payoff"
              type="date"
              value={payoffDate}
              min={toDateKey(new Date())}
              onChange={(e) => setPayoffDate(e.target.value)}
              className={inputCls}
            />
            {payoffDate && (
              <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                Quedan {monthsUntilDate(payoffDate)}{' '}
                {monthsUntilDate(payoffDate) === 1 ? 'mes' : 'meses'} · la cuota se recalcula sola
                cada mes
              </p>
            )}
          </div>
        )}

        {strategy === 'custom' && (
          <div>
            <label htmlFor="edit-custom" className="mb-2 block text-xs font-bold text-slate-600">
              Cuánto pagas cada mes
            </label>
            <input
              id="edit-custom"
              type="text"
              inputMode="decimal"
              value={customPayment}
              onChange={(e) => setCustomPayment(e.target.value)}
              className={`${inputCls} text-right text-xl font-extrabold`}
            />
          </div>
        )}

        {strategy === 'minimum' && (
          <div>
            <label htmlFor="edit-minpct" className="mb-2 block text-xs font-bold text-slate-600">
              % mínimo que exige el banco
            </label>
            <input
              id="edit-minpct"
              type="text"
              inputMode="decimal"
              max={100}
              value={minPercent}
              onChange={(e) => setMinPercent(e.target.value)}
              placeholder="5"
              className={inputCls}
            />
          </div>
        )}

        {/* Día de pago: atajos + cualquier día del 1 al 31 */}
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
              className={`${inputCls} w-20 text-center`}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[1, 5, 10, 15, 20, 25, 28, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { haptic(); setDueDay(d); }}
                aria-pressed={dueDay === d}
                className={`h-10 w-10 rounded-full text-sm font-bold transition active:scale-90 ${
                  dueDay === d ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 ring-1 ring-sky-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Extra y cupo */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="edit-extra" className="mb-2 block text-xs font-bold text-slate-600">
              Abono extra al mes
            </label>
            <input
              id="edit-extra"
              type="text"
              inputMode="decimal"
              value={extraMonthly}
              onChange={(e) => setExtraMonthly(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="edit-limit" className="mb-2 block text-xs font-bold text-slate-600">
              Cupo de la tarjeta
            </label>
            <input
              id="edit-limit"
              type="text"
              inputMode="decimal"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="—"
              className={inputCls}
            />
          </div>
        </div>

        {/* ─── La promoción al 0 %, si la hay ──────────────────────────────
            Un saldo «0 % hasta el 25/01/2027» no es una deuda gratis: es una
            gratis HASTA esa fecha. Sin estos dos datos la app prometía que no
            costaba nada y callaba la única fecha con consecuencias. */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
          <p className="mb-2.5 text-xs font-bold text-slate-600">
            ¿Es un saldo promocional al 0 %?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-promo-ends" className="mb-1 block text-[11px] font-semibold text-slate-500">
                El 0 % dura hasta
              </label>
              <input
                id="edit-promo-ends"
                type="date"
                value={promoEndsOn}
                onChange={(e) => setPromoEndsOn(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="edit-rate-after" className="mb-1 block text-[11px] font-semibold text-slate-500">
                Después, tasa anual
              </label>
              <input
                id="edit-rate-after"
                type="text"
                inputMode="decimal"
                value={rateAfterPromo}
                onChange={(e) => setRateAfterPromo(e.target.value)}
                placeholder="23.74"
                className={inputCls}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Los dos vienen en tu estado de cuenta, en «Cálculo del Cargo por Intereses».
            Con esto la app te dirá cuánto tienes que pagar al mes para liquidarlo antes de
            que empiece a cobrar.
          </p>

          <div className="mt-3">
            <label htmlFor="edit-cycle-days" className="mb-1 block text-[11px] font-semibold text-slate-500">
              Días del ciclo de facturación
            </label>
            <input
              id="edit-cycle-days"
              type="text"
              inputMode="numeric"
              value={cycleDays}
              onChange={(e) => setCycleDays(e.target.value)}
              placeholder="31"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Con esto el interés se calcula como lo cobra el banco —tasa diaria por días del
              ciclo— y la cifra cuadra al centavo con tu estado.
            </p>
          </div>
        </div>

        <ScopePicker
          value={businessShare}
          onChange={setBusinessShare}
          amount={projection.installment}
          currency={debt.currency}
          label="¿De quién es esta deuda?"
        />

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Nota (opcional)"
          aria-label="Nota"
          className={inputCls}
        />

        {/* Consecuencia en vivo: se ve el efecto del cambio ANTES de guardarlo */}
        <div className="rounded-3xl bg-sky-50/80 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-slate-600">Quedaría en</span>
            <span className="text-2xl font-extrabold text-black">
              {fmtMoney(projection.installment, debt.currency)}
              <span className="text-xs font-medium text-slate-400">/mes</span>
            </span>
          </div>
          <SplitBar
            interest={projection.firstSplit.interest}
            principal={projection.firstSplit.principal}
            currency={debt.currency}
          />
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-sky-200/70 pt-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.chip}`}>
              {status.emoji} {status.label}
            </span>
            <span className="text-right text-xs font-semibold text-slate-600">
              {projection.neverPaysOff ? (
                <span className="font-extrabold text-blue-800">Nunca terminas de pagarla</span>
              ) : (
                <>
                  Libre en{' '}
                  <span className="font-extrabold text-black">
                    {fmtMonths(projection.monthsToPayoff)}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
