'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PlusIcon, BriefcaseIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstAt, confettiRain } from '@/lib/fx';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { FinancePlanPayload } from '@/lib/finance-data';
import { buildFinancePlan, personalOnlyInput } from '@/lib/finance-engine';
import type { AdviceAction, FinanceGoal, GoalKind, GoalProjection, PlanInput } from '@/lib/finance-engine';
import { topPlanChange } from '@/lib/plan-diff';
import AdviceFeed from './AdviceFeed';
import BusinessPanel from './BusinessPanel';
import CashFlowCard from './CashFlowCard';
import ContributeModal from './ContributeModal';
import DebtPanel from './DebtPanel';
import GoalCard from './GoalCard';
import GoalFormModal, { type GoalPayload } from './GoalFormModal';
import GrocerySpendCard from './GrocerySpendCard';
import IncomeModal, { type IncomePayload } from './IncomeModal';
import OtherSpendCard from './OtherSpendCard';
import SimulatorCard from './SimulatorCard';
import { BTN_PRIMARY, BTN_SOFT, LABEL, NUM, fmtMoney, healthColor, healthLabel } from './finance-ui';

interface Props {
  readonly initialData: FinancePlanPayload;
}

type Modal =
  | { kind: 'none' }
  /** `preset` abre el formulario con ese tipo de meta ya elegido. */
  | { kind: 'goal'; goal: FinanceGoal | null; preset?: GoalKind }
  | { kind: 'income' }
  | { kind: 'contribute'; goal: GoalProjection };

/** Atajos del estado vacío: tocar el tipo ES la instrucción. */
const GOAL_SHORTCUTS: readonly { id: string; kind: GoalKind; emoji: string; label: string }[] = [
  { id: 'trip', kind: 'trip', emoji: '✈️', label: 'Viaje' },
  { id: 'debt', kind: 'debt', emoji: '💳', label: 'Deuda' },
  { id: 'project', kind: 'project', emoji: '🏗️', label: 'Proyecto' },
  { id: 'purchase', kind: 'purchase', emoji: '🛍️', label: 'Compra' },
  { id: 'emergency', kind: 'emergency', emoji: '🛟', label: 'Fondo' },
];

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
  const toast = useToast();
  const [data, setData] = useState(initialData);
  /**
   * Si el dinero del negocio cuenta para las metas.
   *
   * Arranca SIEMPRE apagado, en cada visita. El plan que la app enseña de
   * entrada es el del bolsillo del usuario; meter el negocio cambia todas las
   * cifras de la pantalla —lo libre del mes, lo que cabe en las metas, la
   * salud— y eso no puede pasar sin que él lo haya pedido.
   *
   * No es una preferencia guardada a propósito: la respuesta no es fija,
   * depende de si piensa financiar ESA meta con dinero del negocio, así que se
   * responde mirando y vuelve a su sitio al salir.
   *
   * Para quien no tenga nada marcado como negocio esto da igual: el
   * interruptor ni se monta, y `planInput` ignora su valor.
   */
  const [includeBusiness, setIncludeBusiness] = useState(false);
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const [deleting, setDeleting] = useState<GoalProjection | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Referencia estable: evita que el efecto de ModalShell se reejecute en
   *  cada render (guardaba 'hidden' como overflow "anterior" del body). */
  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  /**
   * Recarga el plan y AVISA de lo que cambió en las metas.
   *
   * Cada vez que entra información nueva —un ingreso, un aporte, una meta
   * editada, un gasto registrado— el plan se recalcula entero y la pantalla
   * cambiaba sola, sin decir qué se movió ni por qué. Ahora se comparan las dos
   * fotos y se dice la más importante en una línea: "tu viaje se adelanta 2
   * meses", "la meta ya no llega a tiempo".
   *
   * `silent` para la recarga manual del botón: ahí el usuario no ha aportado
   * ningún dato nuevo, así que no hay nada que anunciarle.
   */
  const refresh = useCallback(async (silent = false) => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/finance/plan', { credentials: 'include' });
      if (!res.ok) return;
      const next = (await res.json()) as FinancePlanPayload;
      // `setData(prev => …)` y no la variable `data`: entre el clic y la
      // respuesta puede haber entrado otra actualización, y comparar contra una
      // foto vieja anunciaría un cambio que no ocurrió.
      setData((prev) => {
        if (!silent) {
          try {
            const change = topPlanChange(prev, next);
            if (change) toast.show(change.message, change.tone === 'warning' ? 'info' : 'success');
          } catch {
            // Un aviso roto jamás puede impedir que el plan se actualice.
          }
        }
        return next;
      });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

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

  /**
   * Los adornos (sonido, confeti) y el refresco van DESPUÉS de cerrar el modal
   * y sin poder tumbar el flujo: si uno fallara, el llamante mostraría "no se
   * pudo guardar" sobre una meta que sí quedó guardada.
   */
  function celebrate(run: () => void) {
    try {
      run();
    } catch {
      // un adorno roto nunca debe parecer un fallo al guardar
    }
  }

  async function saveGoal(payload: GoalPayload) {
    const editing = modal.kind === 'goal' && modal.goal !== null;
    const url = editing ? `/api/finance/goals/${(modal as { goal: FinanceGoal }).goal.id}` : '/api/finance/goals';
    await send(url, editing ? 'PATCH' : 'POST', payload);
    setModal({ kind: 'none' });
    if (!editing) {
      celebrate(() => {
        playSound('levelup');
        burstAt(window.innerWidth / 2, window.innerHeight / 3, [payload.emoji, '🎯', '✨']);
      });
    }
    await refresh();
  }

  async function contribute(goalId: string, amount: number, note: string | null) {
    const updated = (await send(`/api/finance/goals/${goalId}/contribute`, 'POST', { amount, note })) as FinanceGoal;
    setModal({ kind: 'none' });
    celebrate(() => {
      playSound('payment');
      if (updated.savedAmount >= updated.targetAmount) {
        confettiRain(['🎉', '🏆', '✨']);
      } else {
        burstAt(window.innerWidth / 2, window.innerHeight / 2, ['💰', '✨']);
      }
    });
    await refresh();
  }

  async function completeGoal(goalId: string) {
    await send(`/api/finance/goals/${goalId}`, 'PATCH', { status: 'done' });
    celebrate(() => confettiRain(['🎉', '🏆']));
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
      case 'open_debts':
        return router.push('/debts');
      case 'edit_goal': {
        const goal = data.rawGoals.find((g) => g.id === action.goalId);
        return setModal({ kind: 'goal', goal: goal ?? null });
      }
      case 'contribute': {
        // `view` y no `data`: el consejo que se acaba de tocar se generó con la
        // vista actual, así que el modal tiene que abrirse con esa misma
        // proyección. Con `data` mostraría los números del plan completo aunque
        // el usuario tenga el negocio excluido.
        const projection = view.goals.find((g) => g.goalId === action.goalId);
        if (projection) setModal({ kind: 'contribute', goal: projection });
        return;
      }
      default:
        return undefined;
    }
  }

  // ── Derivados ──────────────────────────────────────────────────────────────

  /** La foto completa del mes, tal cual la trajo el servidor. */
  const fullInput: PlanInput = useMemo(
    () => ({
      incomes: data.incomes,
      goals: data.rawGoals,
      fixedPayments: data.payments,
      // Las cuotas de crédito faltaban aquí: el simulador calculaba con más
      // dinero libre del que hay y prometía metas antes de tiempo.
      credits: data.credits,
      groceriesMonthly: data.groceries.baseline,
      groceriesSource: data.groceries.baselineSource,
      groceriesSpentThisMonth: data.groceries.spentThisMonth,
      groceries: data.groceries,
      // Faltaba lo mismo que faltaba en las cuotas de crédito: sin esto el
      // simulador y la vista solo-personal calculan con dinero ya gastado en
      // comer fuera y prometen metas antes de tiempo.
      otherExpensesMonthly: data.otherSpend.baseline,
      otherSpend: data.otherSpend,
      // Los porcentajes de negocio: sin ellos, apagar «contar el negocio»
      // dejaba el super y los gastos de fuera enteros del lado personal.
      groceriesBusinessShare: data.groceriesBusinessShare,
      otherBusinessShare: data.otherBusinessShare,
    }),
    [data],
  );

  /**
   * Lo que se está mirando. Con el negocio excluido el plan se RECALCULA con el
   * MISMO motor puro que usa el servidor, así que las dos vistas son igual de
   * fiables: no hay una versión «de verdad» y otra aproximada.
   */
  const planInput = useMemo(
    () => (includeBusiness || !data.scopes.hasBusiness ? fullInput : personalOnlyInput(fullInput)),
    [fullInput, includeBusiness, data.scopes.hasBusiness],
  );

  const view = useMemo(
    () => (planInput === fullInput ? data : { ...data, ...buildFinancePlan(planInput) }),
    [data, planInput, fullInput],
  );

  const activeGoals = view.goals.filter((g) => g.status === 'active');
  const doneGoals = view.goals.filter((g) => g.status === 'done');
  const cash = view.cashFlow;
  /** Sin ingreso no hay plan que calcular: la cabecera cambia de prioridad. */
  const needsIncome = cash.monthlyIncome <= 0;

  return (
    <div className="space-y-5 pb-24">
      {/* ─── Hero: salud financiera ──────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-100 via-blue-100 to-sky-50 border border-sky-200 p-5 shadow-sm">
        <div className="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-white/40 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-5">
          <HealthRing score={view.healthScore} />
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] uppercase tracking-widest font-bold ${LABEL}`}>Salud financiera</p>
            <h2 className={`text-2xl font-black leading-tight ${NUM}`}>{healthLabel(view.healthScore)}</h2>
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

        {/* Sin ingresos cargados, «Ingresos» es LA acción: se lleva el ancho y el
            color, y «Nueva meta» pasa a segundo plano. Es el mismo mensaje que
            antes repetía el consejero más abajo, pero dicho con la jerarquía en
            vez de con un párrafo de instrucciones. */}
        <div className="relative flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => { haptic(12); setModal({ kind: 'goal', goal: null }); }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm shadow-sm transition ${
              needsIncome ? `px-4 font-bold ${BTN_SOFT}` : `flex-1 font-black ${BTN_PRIMARY}`
            }`}
          >
            <PlusIcon className="w-4 h-4" />
            Nueva meta
          </button>
          <button
            type="button"
            onClick={() => { haptic(10); setModal({ kind: 'income' }); }}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm transition ${
              needsIncome ? `flex-1 font-black shadow-sm ${BTN_PRIMARY}` : `px-4 font-bold ${BTN_SOFT}`
            }`}
          >
            <BriefcaseIcon className="w-4 h-4" />
            Ingresos
          </button>
          <button
            type="button"
            onClick={() => { haptic(8); void refresh(true); }}
            aria-label="Actualizar plan"
            className={`p-2.5 rounded-2xl transition ${BTN_SOFT}`}
          >
            <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ¿El dinero del negocio cuenta para las metas?
            Solo aparece si hay negocio. La respuesta no es fija —depende de si
            el usuario piensa financiar ESA meta con dinero del negocio— así que
            es un interruptor a la vista y no un ajuste enterrado. */}
        {data.scopes.hasBusiness && (
          <button
            type="button"
            onClick={() => { haptic(10); setIncludeBusiness((v) => !v); }}
            aria-pressed={includeBusiness}
            className="relative mt-2 flex w-full items-center gap-3 rounded-2xl bg-white/70 px-3.5 py-2.5 text-left transition active:scale-[0.99] hover:bg-white"
          >
            <span
              className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                includeBusiness ? 'bg-sky-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  includeBusiness ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-black">
                🏢 Contar el negocio en el plan
              </span>
              <span className={`block text-[11px] ${LABEL}`}>
                {includeBusiness
                  ? `Incluye ${fmtMoney(data.scopes.business.income)} que factura y ${fmtMoney(data.scopes.business.expenses)} que gasta`
                  : 'Solo tu dinero personal cuenta para las metas'}
              </span>
            </span>
          </button>
        )}
      </section>

      {/* ─── Flujo del mes ───────────────────────────────────────────────── */}
      <CashFlowCard
        cash={cash}
        groceriesSource={data.groceries.baselineSource}
        onOpenIncome={() => setModal({ kind: 'income' })}
        onOpenPayments={() => router.push('/payments')}
        onOpenBudget={() => router.push('/budget')}
        onOpenDebts={() => router.push('/debts')}
        onOpenTrips={() => router.push('/shopping-trips')}
      />

      {/* ─── Compras reales ──────────────────────────────────────────────── */}
      <GrocerySpendCard
        groceries={data.groceries}
        history={data.history}
        // `true`: editar una línea del desglose no cambia las metas por sí
        // mismo, y un aviso de "tu viaje se adelanta" al corregir un centavo
        // sería ruido.
        onChanged={() => void refresh(true)}
      />

      {/* ─── Lo que se va fuera del super ────────────────────────────────── */}
      <OtherSpendCard other={data.otherSpend} onChanged={() => void refresh(true)} />

      {/* ─── Consejero ───────────────────────────────────────────────────── */}
      <AdviceFeed advice={view.advice} onAction={runAdviceAction} />

      {/* ─── Negocio ─────────────────────────────────────────────────────── */}
      {/* `planInput` y no `data`: con el negocio excluido, la vista se
          recalcula con el motor puro, y el desglose tiene que contar la misma
          historia que las cifras que acompaña. */}
      <BusinessPanel
        scopes={view.scopes}
        items={{
          incomes: planInput.incomes,
          fixedPayments: planInput.fixedPayments,
          credits: planInput.credits ?? [],
          groceriesMonthly: planInput.groceriesMonthly,
          groceriesBusinessShare: planInput.groceriesBusinessShare ?? 0,
          otherExpensesMonthly: planInput.otherExpensesMonthly ?? 0,
          otherBusinessShare: planInput.otherBusinessShare ?? 0,
        }}
      />

      {/* ─── Deuda ───────────────────────────────────────────────────────── */}
      <DebtPanel debts={view.debts} onChanged={() => void refresh(true)} />

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
          /* Sin instrucciones: el tipo de meta se elige tocándolo, y el
             formulario abre con esa opción ya puesta. */
          <div className="grid grid-cols-3 gap-3">
            {GOAL_SHORTCUTS.map(({ id, kind, emoji, label }) => (
              <motion.button
                key={id}
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                onClick={() => { haptic(12); setModal({ kind: 'goal', goal: null, preset: kind }); }}
                className="flex flex-col items-center justify-center gap-2 aspect-square rounded-3xl bg-white border border-sky-100 shadow-sm active:shadow-inner transition-shadow"
              >
                <span className="text-3xl leading-none" aria-hidden="true">{emoji}</span>
                <span className={`text-xs font-bold ${NUM}`}>{label}</span>
              </motion.button>
            ))}
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

      {/* ─── Modales ─────────────────────────────────────────────────────────
          Renderizado condicional directo, SIN AnimatePresence.

          Con AnimatePresence los tres hijos condicionales se volvían `false` a
          la vez al cerrar, y nunca completaba el desmontaje: el modal quedaba
          montado e invisible (opacity 0), con el fondo bloqueado y el overlay
          capturando los clics. La app parecía congelada justo después de
          guardar una meta — y ni «Cancelar» la liberaba.

          La animación de ENTRADA se conserva (ocurre al montar). Perder la de
          salida es un precio ínfimo por un cierre que siempre funciona. */}
      {modal.kind === 'goal' && (
        <GoalFormModal
          goal={modal.goal}
          preset={modal.preset}
          monthlyAvailable={cash.goalsBudget}
          onSave={saveGoal}
          onClose={closeModal}
        />
      )}
      {modal.kind === 'income' && (
        <IncomeModal
          incomes={data.incomes}
          onCreate={createIncome}
          onToggle={toggleIncome}
          onDelete={deleteIncome}
          onClose={closeModal}
        />
      )}
      {modal.kind === 'contribute' && (
        <ContributeModal
          goal={modal.goal}
          onContribute={(amount, note) => contribute(modal.goal.goalId, amount, note)}
          onClose={closeModal}
        />
      )}

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
