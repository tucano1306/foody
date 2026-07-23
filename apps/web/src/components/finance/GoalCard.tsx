'use client';

import { motion } from 'framer-motion';
import { PencilSquareIcon, TrashIcon, PlusCircleIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { haptic } from '@/lib/haptic';
import type { GoalProjection } from '@/lib/finance-engine';
import { FEASIBILITY_META, KIND_META, fmtMoney, fmtMoneyFine, formatDateKey } from './finance-ui';

interface Props {
  readonly goal: GoalProjection;
  readonly index: number;
  readonly onContribute: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onComplete: () => void;
}

const RADIUS = 34;
const CIRC = 2 * Math.PI * RADIUS;

function ProgressRing({ pct, color, emoji }: { readonly pct: number; readonly color: string; readonly emoji: string }) {
  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="currentColor" className="text-slate-200" strokeWidth="7" />
        <motion.circle
          cx="40"
          cy="40"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: CIRC - (Math.min(pct, 100) / 100) * CIRC }}
          transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
        <span className="text-[11px] font-black text-black tabular-nums mt-0.5">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

export default function GoalCard({ goal, index, onContribute, onEdit, onDelete, onComplete }: Props) {
  const meta = KIND_META[goal.kind];
  const feas = FEASIBILITY_META[goal.feasibility];
  const done = goal.feasibility === 'done';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 260, damping: 26 }}
      className="rounded-3xl border border-sky-100 bg-sky-50/70 shadow-sm overflow-hidden"
    >
      {/* Encabezado pastel */}
      <div className={`bg-linear-to-br ${meta.gradient} px-4 py-4`}>
        <div className="flex items-center gap-4">
          <ProgressRing pct={goal.percentComplete} color={meta.ring} emoji={goal.emoji || meta.emoji} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-black truncate">{goal.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${feas.chip}`}>
                {feas.icon} {feas.label}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-700 tabular-nums mt-1">
              {fmtMoney(goal.savedAmount)}
              <span className="text-slate-500 font-medium"> de {fmtMoney(goal.targetAmount)}</span>
            </p>
            <p className="text-[11px] text-slate-600/80 mt-0.5">
              {goal.targetDate
                ? goal.daysLeft !== null && goal.daysLeft > 0
                  ? `📅 ${formatDateKey(goal.targetDate, true)} · faltan ${goal.daysLeft} días`
                  : `📅 ${formatDateKey(goal.targetDate, true)} · fecha vencida`
                : '🗓️ Sin fecha límite'}
            </p>
          </div>
        </div>
      </div>

      {/* Números del plan */}
      <div className="px-4 py-3 grid grid-cols-3 gap-2 border-b border-sky-100">
        {[
          { label: 'Falta', value: fmtMoney(goal.remaining), tone: 'text-black' },
          {
            label: 'Necesitas/mes',
            value: fmtMoneyFine(goal.requiredMonthly),
            tone: 'text-black',
          },
          {
            label: 'Plan asigna',
            value: fmtMoneyFine(goal.allocatedMonthly),
            tone: goal.allocatedMonthly > 0 ? 'text-black' : 'text-slate-400',
          },
        ].map((cell) => (
          <div key={cell.label} className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">{cell.label}</p>
            <p className={`text-sm font-black tabular-nums ${cell.tone}`}>{cell.value}</p>
          </div>
        ))}
      </div>

      {/* Diagnóstico */}
      {!done && (
        <div className="px-4 py-2.5 text-xs text-slate-600 bg-white/60">
          {goal.shortfallMonthly > 0 ? (
            <span>
              ⚠️ Te faltan <strong className="text-black">{fmtMoneyFine(goal.shortfallMonthly)}</strong> al mes.
              {goal.projectedDate && ` A este ritmo la lograrías el ${formatDateKey(goal.projectedDate, true)}`}
              {goal.monthsLate > 0 && ` (${goal.monthsLate} ${goal.monthsLate === 1 ? 'mes' : 'meses'} tarde).`}
            </span>
          ) : (
            <span>
              💡 Aparta <strong className="text-black">{fmtMoneyFine(goal.requiredWeekly)}</strong> por semana
              {goal.requiredDaily > 0 && ` o ${fmtMoneyFine(goal.requiredDaily)} al día`} y llegas a tiempo.
            </span>
          )}
        </div>
      )}

      {/* Acciones */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { haptic(10); onContribute(); }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-linear-to-r from-sky-400 to-blue-400 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold shadow-sm transition"
        >
          <PlusCircleIcon className="w-4 h-4" />
          Aportar
        </button>
        {done && (
          <button
            type="button"
            onClick={() => { haptic([12, 20, 12]); onComplete(); }}
            title="Marcar como lograda"
            aria-label="Marcar como lograda"
            className="p-2.5 rounded-2xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition"
          >
            <CheckCircleIcon className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => { haptic(8); onEdit(); }}
          title="Editar meta"
          aria-label="Editar meta"
          className="p-2.5 rounded-2xl bg-white/70 text-slate-500 hover:bg-slate-100 transition"
        >
          <PencilSquareIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => { haptic(14); onDelete(); }}
          title="Eliminar meta"
          aria-label="Eliminar meta"
          className="p-2.5 rounded-2xl bg-white/70 text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>
    </motion.article>
  );
}
