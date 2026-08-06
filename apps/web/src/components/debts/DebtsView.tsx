'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { DebtWithProjection, DebtsSnapshot } from '@/lib/debt-data';
import { buildPortfolio, type PortfolioDebt } from '@/lib/debt-engine';
import { haptic } from '@/lib/haptic';
import DebtCard from './DebtCard';
import DebtDetailSheet from './DebtDetailSheet';
import DebtEditModal from './DebtEditModal';
import DebtPaymentModal from './DebtPaymentModal';
import DebtWizardModal from './DebtWizardModal';
import { fmtDateKey, fmtMoney, fmtMoneyShort, KIND_META } from './debt-ui';

interface Props {
  readonly initial: DebtsSnapshot;
}

/**
 * Sección de Deudas y Créditos.
 *
 * La cartera va arriba porque la primera pregunta siempre es la misma —*¿cuánto
 * debo y cuánto me está costando?*— y la respuesta no debería requerir sumar
 * tarjetas mentalmente. Debajo, una tarjeta por deuda ordenada de mayor a menor
 * saldo, y el alta al final, sin tapar nada.
 */
export default function DebtsView({ initial }: Props) {
  const [debts, setDebts] = useState<DebtWithProjection[]>(initial.debts);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);

  // La cartera se recalcula en el cliente para que los totales se muevan en el
  // mismo instante en que se registra un abono, sin recargar la página.
  const portfolio = useMemo(() => {
    const input: PortfolioDebt[] = debts
      .filter((d) => d.currentBalance > 0)
      .map((d) => ({
        id: d.id,
        name: d.name,
        balance: d.currentBalance,
        monthlyRate: d.projection.monthlyRate,
        installment: d.projection.installment,
        monthlyInterest: d.projection.monthlyInterest,
        monthsToPayoff: d.projection.monthsToPayoff,
        neverPaysOff: d.projection.neverPaysOff,
        status: d.projection.status,
      }));
    return buildPortfolio(input);
  }, [debts]);

  const currency = debts[0]?.currency ?? 'USD';
  const detail = debts.find((d) => d.id === detailId) ?? null;
  const paying = debts.find((d) => d.id === payId) ?? null;
  const editing = debts.find((d) => d.id === editId) ?? null;
  const target = portfolio.avalanche[0] ?? null;

  const upsert = useCallback((updated: DebtWithProjection) => {
    setDebts((prev) => {
      const exists = prev.some((d) => d.id === updated.id);
      const next = exists ? prev.map((d) => (d.id === updated.id ? updated : d)) : [...prev, updated];
      return [...next].sort((a, b) => b.currentBalance - a.currentBalance);
    });
  }, []);

  const remove = useCallback((id: string) => {
    setDebts((prev) => prev.filter((d) => d.id !== id));
    setDetailId(null);
  }, []);

  return (
    <div className="space-y-5">
      {/* ─── Cartera ─────────────────────────────────────────────────────── */}
      {debts.length > 0 && (
        <section className="rounded-3xl bg-linear-to-br from-sky-500 to-blue-700 p-5 shadow-sm">
          <p className="text-xs font-semibold text-white/75">Debes en total</p>
          <p className="text-4xl font-extrabold leading-tight text-white">
            {fmtMoneyShort(portfolio.totalBalance, currency)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/15 px-3.5 py-3">
              <p className="text-[11px] font-semibold text-white/75">Interés cada mes</p>
              <p className="text-lg font-extrabold text-white">
                {fmtMoney(portfolio.totalMonthlyInterest, currency, 0)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 px-3.5 py-3">
              <p className="text-[11px] font-semibold text-white/75">Cuotas al mes</p>
              <p className="text-lg font-extrabold text-white">
                {fmtMoney(portfolio.totalMonthlyCommitment, currency, 0)}
              </p>
            </div>
          </div>

          {portfolio.freeDate && (
            <p className="mt-3 rounded-2xl bg-white/20 px-3.5 py-2.5 text-xs font-bold text-white">
              🏁 Sin deudas en {fmtDateKey(portfolio.freeDate)}
            </p>
          )}
          {portfolio.stuck.length > 0 && (
            <p className="mt-3 rounded-2xl bg-white/20 px-3.5 py-2.5 text-xs font-bold text-white">
              🛑 {portfolio.stuck.length}{' '}
              {portfolio.stuck.length === 1 ? 'deuda no termina' : 'deudas no terminan'} con la cuota
              de ahora
            </p>
          )}
        </section>
      )}

      {/* ─── A cuál atacar primero ───────────────────────────────────────── */}
      {target && debts.filter((d) => d.currentBalance > 0).length > 1 && (
        <button
          type="button"
          onClick={() => {
            haptic();
            setDetailId(target.id);
          }}
          className="flex w-full items-center gap-3 rounded-3xl border border-sky-200 bg-sky-50/80 px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.99] hover:shadow-sm"
        >
          <span className="text-2xl" aria-hidden="true">🎯</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-black">Ataca primero {target.name}</p>
            <p className="text-[11px] text-slate-600">
              Es la de tasa más alta: te cuesta{' '}
              {fmtMoney(target.monthlyInterest, currency)} al mes
            </p>
          </div>
          <span className="shrink-0 text-slate-400" aria-hidden="true">›</span>
        </button>
      )}

      {/* ─── Lista ───────────────────────────────────────────────────────── */}
      {debts.length > 0 && (
        <div className="card-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
          {debts.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              onOpen={() => setDetailId(debt.id)}
              onPay={() => setPayId(debt.id)}
            />
          ))}
        </div>
      )}

      {/* ─── Vacío: tocar el tipo de deuda ABRE el alta encaminada ───────── */}
      {debts.length === 0 && (
        <div className="py-4">
          <div className="grid grid-cols-3 gap-3">
            {(['credit_card', 'loan', 'auto', 'mortgage', 'store', 'other'] as const).map((k) => {
              const meta = KIND_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    haptic();
                    setWizardOpen(true);
                  }}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl border border-sky-100 bg-white shadow-sm transition-all duration-150 active:scale-95 active:shadow-inner hover:shadow-md"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">{meta.emoji}</span>
                  <span className="text-xs font-bold text-black">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* El alta vivía en un botón flotante fijo que TAPABA el contenido de las
          tarjetas —la cuota quedaba debajo del círculo—. Ahora es un botón
          ancho al final de la lista: nada se solapa, y al ir en el flujo del
          documento sigue quedando a mano del pulgar. */}
      <button
        type="button"
        onClick={() => {
          haptic();
          setWizardOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-3xl bg-sky-500 py-4 text-sm font-bold text-white shadow-sm transition-all duration-150 hover:bg-sky-600 active:scale-95"
      >
        <PlusIcon className="h-5 w-5" />
        Agregar deuda
      </button>

      <AnimatePresence>
        {wizardOpen && (
          <DebtWizardModal
            key="wizard"
            currency={currency}
            onClose={() => setWizardOpen(false)}
            onCreated={upsert}
          />
        )}
        {detail && (
          <DebtDetailSheet
            key="detail"
            debt={detail}
            onClose={() => setDetailId(null)}
            onChanged={upsert}
            onDeleted={remove}
            onPay={() => {
              setPayId(detail.id);
              setDetailId(null);
            }}
            onEdit={() => {
              setEditId(detail.id);
              setDetailId(null);
            }}
          />
        )}
        {editing && (
          <DebtEditModal
            key="edit"
            debt={editing}
            onClose={() => setEditId(null)}
            onSaved={upsert}
          />
        )}
        {paying && (
          <DebtPaymentModal
            key="pay"
            debt={paying}
            onClose={() => setPayId(null)}
            onPaid={upsert}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
