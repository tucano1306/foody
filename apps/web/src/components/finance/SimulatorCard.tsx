'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import { buildFinancePlan, type PlanInput } from '@/lib/finance-engine';
import { fmtMoney } from './finance-ui';

interface Props {
  /** La misma entrada que produjo el plan actual — se recalcula en el navegador. */
  readonly planInput: PlanInput;
}

const STEPS = [0, 50, 100, 200, 300, 500, 750, 1000];

/**
 * "¿Y si aporto más?" — recalcula el plan completo en el cliente (el motor es
 * puro) y muestra cuántas metas pasan a estar en camino y cuánto se adelantan.
 */
export default function SimulatorCard({ planInput }: Props) {
  const [extra, setExtra] = useState(0);

  const { base, simulated } = useMemo(() => {
    const now = new Date();
    return {
      base: buildFinancePlan({ ...planInput, extraMonthly: 0, now }),
      simulated: buildFinancePlan({ ...planInput, extraMonthly: extra, now }),
    };
  }, [planInput, extra]);

  const healthyBefore = base.goals.filter((g) => g.feasibility === 'on_track' || g.feasibility === 'done').length;
  const healthyAfter = simulated.goals.filter((g) => g.feasibility === 'on_track' || g.feasibility === 'done').length;

  // Meta prioritaria: cuánto se adelanta con el dinero extra.
  const priority = simulated.goals.find((g) => g.status === 'active' && g.remaining > 0);
  const priorityBase = priority ? base.goals.find((g) => g.goalId === priority.goalId) : undefined;
  const monthsSaved = useMemo(() => {
    if (!priority || !priorityBase) return 0;
    const before = priorityBase.allocatedMonthly > 0 ? Math.ceil(priorityBase.remaining / priorityBase.allocatedMonthly) : null;
    const after = priority.allocatedMonthly > 0 ? Math.ceil(priority.remaining / priority.allocatedMonthly) : null;
    if (before === null || after === null) return 0;
    return Math.max(0, before - after);
  }, [priority, priorityBase]);

  return (
    <section className="rounded-3xl border border-sky-200 bg-linear-to-br from-sky-50 to-blue-50 p-5">
      <h2 className="text-sm font-black text-black uppercase tracking-wide">
        🔮 Simulador «¿y si…?»
      </h2>
      <p className="text-xs text-slate-600 mt-1">
        Mueve el deslizador para ver qué pasa si consigues dinero extra cada mes.
      </p>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
            Dinero extra al mes
          </span>
          <motion.span
            key={extra}
            initial={{ scale: 0.8, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-xl font-black text-black tabular-nums"
          >
            +{fmtMoney(extra)}
          </motion.span>
        </div>

        <input
          type="range"
          min={0}
          max={1000}
          step={25}
          value={extra}
          onChange={(e) => setExtra(Number(e.target.value))}
          onPointerUp={() => haptic(8)}
          aria-label="Dinero extra al mes"
          className="w-full accent-sky-500 cursor-pointer"
        />

        <div className="flex flex-wrap gap-1.5 mt-3">
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setExtra(s); haptic(6); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                extra === s
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-white/70 text-sky-700 hover:bg-white'
              }`}
            >
              {s === 0 ? 'Hoy' : `+${fmtMoney(s)}`}
            </button>
          ))}
        </div>
      </div>

      {/* Resultado de la simulación */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white/70 py-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Salud</p>
          <p className="text-lg font-black text-black tabular-nums">
            {simulated.healthScore}
            {simulated.healthScore !== base.healthScore && (
              <span className={`text-xs ml-1 ${simulated.healthScore > base.healthScore ? 'text-sky-500' : 'text-blue-500'}`}>
                {simulated.healthScore > base.healthScore ? '↑' : '↓'}
              </span>
            )}
          </p>
        </div>
        <div className="rounded-2xl bg-white/70 py-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Metas a tiempo</p>
          <p className="text-lg font-black text-black tabular-nums">
            {healthyAfter}
            {healthyAfter > healthyBefore && <span className="text-xs text-sky-500 ml-1">+{healthyAfter - healthyBefore}</span>}
          </p>
        </div>
        <div className="rounded-2xl bg-white/70 py-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Adelanto</p>
          <p className="text-lg font-black text-black tabular-nums">
            {monthsSaved > 0 ? `${monthsSaved} ${monthsSaved === 1 ? 'mes' : 'meses'}` : '—'}
          </p>
        </div>
      </div>

      {extra > 0 && priority && (
        <p className="text-xs text-sky-700 mt-3 bg-white/60 rounded-xl px-3 py-2">
          {monthsSaved > 0
            ? `Con ${fmtMoney(extra)} extra al mes adelantas «${priority.name}» ${monthsSaved} ${monthsSaved === 1 ? 'mes' : 'meses'}.`
            : `Con ${fmtMoney(extra)} extra al mes tu margen sube a ${fmtMoney(simulated.cashFlow.available)}.`}
        </p>
      )}
    </section>
  );
}
