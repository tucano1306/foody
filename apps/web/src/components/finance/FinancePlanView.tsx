'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PlusIcon, BriefcaseIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstAt, confettiRain } from '@/lib/fx';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { FinancePlanPayload } from '@/lib/finance-data';
import type { AdviceAction, FinanceGoal, GoalProjection, PlanInput } from '@/lib/finance-engine';
import AdviceFeed from './AdviceFeed';
import CashFlowCard from './CashFlowCard';
import ContributeModal from './ContributeModal';
import DebtPanel from './DebtPanel';
import GoalCard from './GoalCard';
import GoalFormModal, { type GoalPayload } from './GoalFormModal';
import GrocerySpendCard from './GrocerySpendCard';
import IncomeModal, { type IncomePayload } from './IncomeModal';
import SimulatorCard from './SimulatorCard';
import { BTN_PRIMARY, BTN_SOFT, LABEL, NUM, fmtMoney, healthColor, healthLabel } from './finance-ui';

interface Props {
  readonly initialData: FinancePlanPayload;
}

type Modal =
  | { kind: 'none' }
  | { kind: 'goal'; goal: FinanceGoal | null }
  | { kind: 'income' }
  | { kind: 'contribute'; goal: GoalProjection };

const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

function HealthRing({ score }: { readonly score: number }) {
  const color = healthColor(score);
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="currentColor" className="text-white/70" strokeWidth="11" />
        <motion.circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: CIRC - (score / 100) * CIRC }}
          transition={{ duration: 1.2, ease: [0.22, 0.61, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={score}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          className={`text-3xl font-black tabular-nums leading-none ${NUM}`}
        >
          {score}
        </motion.span>
        <span className={`text-[10px] uppercase tracking-widest mt-1 ${LABEL}`}>salud</span>
      </div>
    </div>
  );
}

export default function FinancePlanView({ initialData }: Props) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const [deleting, setDeleting] = useState<GoalProjection | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/finance/plan', { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** Todas las mutaciones pasan por aquí: lanza el error del servidor tal cual. */
  const send = useCallback(async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(payload.error ?? payload.message ?? 'Algo salió mal');
    }
    return res.json();
  }, []);

  // ── Metas ──────────────────────────────────────────────────────────────────

  async function saveGoal(payload: GoalPayload) {
    const editing = modal.kind === 'goal' && modal.goal !== null;
    const url = editing ? `/api/finance/goals/${(modal as { goal: FinanceGoal }).goal.id}` : '/api/finance/goals';
    await send(url, editing ? 'PATCH' : 'POST', payload);
    setModal({ kind: 'none' });
    if (!editing) {
      playSound('levelup');
      burstAt(window.innerWidth / 2, window.innerHeight / 3, [payload.emoji, '🎯', '✨']);
    }
    await refresh();
  }

  async function contribute(goalId: string, amount: number, note: string | null) {
    const updated = (await send(`/api/finance/goals/${goalId}/contribute`, 'POST', { amount, note })) as FinanceGoal;
    setModal({ kind: 'none' });
    playSound('payment');
    if (updated.savedAmount >= updated.targetAmount) {
      confettiRain(['🎉', '🏆', '✨']);
    } else {
      burstAt(window.innerWidth / 2, window.innerHeight / 2, ['💰', '✨']);
    }
    await refresh();
  }

  async function completeGoal(goalId: string) {
    await send(`/api/finance/goals/${goalId}`, 'PATCH', { status: 'done' });
    confettiRain(['🎉', '🏆']);
    await refresh();
  }

  async function deleteGoal(goalId: string) {
    await send(`/api/finance/goals/${goalId}`, 'DELETE');
    setDeleting(null);
    await refresh();
  }

  // ── Ingresos ───────────────────────────────────────────────────────────────

  async function createIncome(payload: IncomePayload) {
    await send('/api/finance/income', 'POST', payload);
    await refresh();
  }

  async function toggleIncome(id: string, isActive: boolean) {
    await send(`/api/finance/income/${id}`, 'PATCH', { isActive });
    await refresh();
  }

  async function deleteIncome(id: string) {
    await send(`/api/finance/income/${id}`, 'DELETE');
    await refresh();
  }

  // ── Acciones de los consejos ───────────────────────────────────────────────

  function runAdviceAction(action: AdviceAction) {
    haptic(10);
    switch (action.kind) {
      case 'add_income':
        return setModal({ kind: 'income' });
      case 'add_goal':
        return setModal({ kind: 'goal', goal: null });
      case 'open_payments':
        return router.push('/payments');
      case 'open_budget':
        return router.push('/budget');
      case 'open_trips':
        return router.push('/shopping-trips');
      case 'edit_goal': {
        const goal = data.rawGoals.find((g) => g.id === action.goalId);
        return setModal({ kind: 'goal', goal: goal ?? null });
      }
      case 'contribute': {
        const projection = data.goals.find((g) => g.goalId === action.goalId);
        if (projection) setModal({ kind: 'contribute', goal: projection });
        return;
      }
      default:
        return undefined;
    }
  }

  // ── Derivados ──────────────────────────────────────────────────────────────

  const activeGoals = data.goals.filter((g) => g.status === 'active');
  const doneGoals = data.goals.filter((g) => g.status === 'done');
  const cash = data.cashFlow;

  const planInput: PlanInput = useMemo(
    () => ({
      incomes: data.incomes,
      goals: data.rawGoals,
      fixedPayments: data.payments,
      groceriesMonthly: data.groceries.baseline,
      groceriesSource: data.groceries.baselineSource,
      groceriesSpentThisMonth: data.groceries.spentThisMonth,
      groceries: data.groceries,
    }),
    [data],
  );

  return (
    <div className="space-y-5 pb-24">
      {/* ─── Hero: salud financiera ──────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-100 via-blue-100 to-sky-50 border border-sky-200 p-5 shadow-sm">
        <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/40 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-5">
          <HealthRing score={data.healthScore} />
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] uppercase tracking-widest font-bold ${LABEL}`}>Salud financiera</p>
            <h2 className={`text-2xl font-black leading-tight ${NUM}`}>{healthLabel(data.healthScore)}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-bold ${LABEL}`}>Ingreso</p>
                <p className={`font-black tabular-nums ${NUM}`}>{fmtMoney(cash.monthlyIncome)}</p>
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wide font-bold ${LABEL}`}>Libre al mes</p>
                <p className={`font-black tabular-nums ${NUM}`}>{fmtMoney(cash.available)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => { haptic(12); setModal({ kind: 'goal', goal: null }); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-black shadow-sm transition ${BTN_PRIMARY}`}
          >
            <PlusIcon className="w-4 h-4" />
            Nueva meta
          </button>
          <button
            type="button"
            onClick={() => { haptic(10); setModal({ kind: 'income' }); }}
            className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold transition ${BTN_SOFT}`}
          >
            <BriefcaseIcon className="w-4 h-4" />
            Ingresos
          </button>
          <button
            type="button"
            onClick={() => { haptic(8); void refresh(); }}
            aria-label="Actualizar plan"
            className={`p-2.5 rounded-2xl transition ${BTN_SOFT}`}
          >
            <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>

      {/* ─── Flujo del mes ───────────────────────────────────────────────── */}
      <CashFlowCard
        cash={cash}
        groceriesSource={data.groceries.baselineSource}
        onOpenIncome={() => setModal({ kind: 'income' })}
        onOpenPayments={() => router.push('/payments')}
        onOpenBudget={() => router.push('/budget')}
      />

      {/* ─── Compras reales ──────────────────────────────────────────────── */}
      <GrocerySpendCard groceries={data.groceries} history={data.history} />

      {/* ─── Consejero ───────────────────────────────────────────────────── */}
      <AdviceFeed advice={data.advice} onAction={runAdviceAction} />

      {/* ─── Deuda ───────────────────────────────────────────────────────── */}
      <DebtPanel debts={data.debts} />

      {/* ─── Metas ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-black uppercase tracking-wide">
            🎯 Tus metas
          </h2>
          {activeGoals.length > 0 && (
            <span className="text-[11px] text-slate-400">
              {activeGoals.length} {activeGoals.length === 1 ? 'activa' : 'activas'}
            </span>
          )}
        </div>

        {activeGoals.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-sky-200 bg-sky-50/50 p-8 text-center">
            <span className="text-4xl" aria-hidden="true">🎯</span>
            <h3 className={`text-base font-black mt-3 ${NUM}`}>Dime qué quieres lograr</h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">
              Un viaje, saldar una deuda, un proyecto. Escribe cuánto cuesta y para cuándo lo quieres:
              yo calculo cuánto apartar cada mes y te aviso si te desvías.
            </p>
            <button
              type="button"
              onClick={() => { haptic(12); setModal({ kind: 'goal', goal: null }); }}
              className={`mt-4 px-5 py-2.5 rounded-2xl text-sm font-black shadow-sm ${BTN_PRIMARY}`}
            >
              ✨ Crear mi primera meta
            </button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {activeGoals.map((goal, i) => (
              <GoalCard
                key={goal.goalId}
                goal={goal}
                index={i}
                onContribute={() => setModal({ kind: 'contribute', goal })}
                onEdit={() => {
                  const raw = data.rawGoals.find((g) => g.id === goal.goalId) ?? null;
                  setModal({ kind: 'goal', goal: raw });
                }}
                onDelete={() => setDeleting(goal)}
                onComplete={() => void completeGoal(goal.goalId)}
              />
            ))}
          </AnimatePresence>
        )}

        {doneGoals.length > 0 && (
          <details className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3">
            <summary className={`cursor-pointer text-sm font-bold select-none ${NUM}`}>
              🏆 Metas logradas ({doneGoals.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {doneGoals.map((g) => (
                <li key={g.goalId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">
                    {g.emoji} {g.name}
                  </span>
                  <span className={`font-bold tabular-nums shrink-0 ml-3 ${NUM}`}>
                    {fmtMoney(g.targetAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ─── Simulador ───────────────────────────────────────────────────── */}
      {data.incomes.length > 0 && activeGoals.length > 0 && <SimulatorCard planInput={planInput} />}

      {/* ─── Modales ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {modal.kind === 'goal' && (
          <GoalFormModal
            key="goal-modal"
            goal={modal.goal}
            monthlyAvailable={cash.goalsBudget}
            onSave={saveGoal}
            onClose={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'income' && (
          <IncomeModal
            key="income-modal"
            incomes={data.incomes}
            onCreate={createIncome}
            onToggle={toggleIncome}
            onDelete={deleteIncome}
            onClose={() => setModal({ kind: 'none' })}
          />
        )}
        {modal.kind === 'contribute' && (
          <ContributeModal
            key="contribute-modal"
            goal={modal.goal}
            onContribute={(amount, note) => contribute(modal.goal.goalId, amount, note)}
            onClose={() => setModal({ kind: 'none' })}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={deleting !== null}
        title={`¿Eliminar «${deleting?.name ?? ''}»?`}
        message="Se borrará la meta y su historial de aportes. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => { if (deleting) void deleteGoal(deleting.goalId); }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
