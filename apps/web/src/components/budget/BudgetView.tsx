'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstAt } from '@/lib/fx';
import { buildHistoryWindow, budgetFigures, monthAmount, monthKeyOf } from '@/lib/budget-history';
import { summarizeByScope, type ScopeFilter } from '@/lib/expense-scope';
import ScopeTabs from '@/components/ui/ScopeTabs';
import type { BudgetMonthEntry as MonthEntry } from '@/lib/budget-history';
import { parseMoney } from '@/lib/money-input';

interface BudgetData {
  monthlyLimit: number;
  spentThisMonth: number;
  remaining: number | null;
  percentUsed: number | null;
  avgMonthly: number;
  currency: string;
  history: MonthEntry[];
}

interface Props {
  readonly initialData: BudgetData;
  /** Ámbito con el que abrir, si quien enlaza aquí ya sabe cuál quiere. */
  readonly initialScope?: ScopeFilter;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function monthLabel(yyyymm: string): string {
  const [year, month] = yyyymm.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString('es-MX', { month: 'short' });
}

function getBudgetStatus(pct: number | null): { label: string; color: string; bg: string; arc: string } {
  if (pct === null) return { label: 'Sin límite', color: 'text-slate-500', bg: 'bg-slate-100', arc: '#94a3b8' };
  if (pct >= 100) return { label: '¡Excedido!', color: 'text-blue-600', bg: 'bg-blue-50', arc: '#1d4ed8' };
  if (pct >= 80) return { label: 'Atención', color: 'text-sky-600', bg: 'bg-sky-50', arc: '#3b82f6' };
  return { label: 'Bajo control', color: 'text-sky-700', bg: 'bg-sky-50', arc: '#0284c7' };
}

/** Game-face for the gauge: relaxed → nervous → on fire. */
function getGaugeEmoji(pct: number): string {
  if (pct >= 100) return '🔥';
  if (pct >= 80) return '😬';
  if (pct >= 50) return '🙂';
  return '😎';
}

// SVG arc for the radial progress
const RADIUS = 80;
const CIRC = 2 * Math.PI * RADIUS;

function RadialArc({ pct, color }: { readonly pct: number; readonly color: string }) {
  const clampedPct = Math.min(pct, 100);
  const dash = (clampedPct / 100) * CIRC;
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
      {/* Track */}
      <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="16" />
      {/* Progress */}
      <motion.circle
        cx="100"
        cy="100"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="16"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        initial={{ strokeDashoffset: CIRC }}
        animate={{ strokeDashoffset: CIRC - dash }}
        transition={{ duration: 1.1, ease: [0.22, 0.61, 0.36, 1] }}
      />
    </svg>
  );
}

// Mini bar chart for history
function HistoryBars({ history, budgetLine, currentKey }: { readonly history: MonthEntry[]; readonly budgetLine: number; readonly currentKey: string }) {
  if (history.length === 0) {
    return (
      <p className="text-center text-xs text-slate-400 py-4">
        Aún no hay historial de compras en meses anteriores
      </p>
    );
  }
  const max = Math.max(...history.map((h) => h.total), budgetLine, 1);
  return (
    <div className="flex items-end gap-2 h-24">
      {history.map((h) => {
        const heightPct = (h.total / max) * 100;
        const overBudget = budgetLine > 0 && h.total > budgetLine;
        const isCurrent = h.month === currentKey;
        return (
          <div key={h.month} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <span className={`text-[10px] tabular-nums ${isCurrent ? 'font-bold text-slate-700' : 'font-semibold text-slate-500'}`}>{fmt(h.total)}</span>
            <motion.div
              className={`w-full rounded-t-md ${overBudget ? 'bg-blue-400' : isCurrent ? 'bg-sky-500' : 'bg-sky-400'}`}
              style={{ height: 0 }}
              animate={{ height: `${Math.max(heightPct, 4)}%` }}
              transition={{ duration: 0.7, delay: 0.05 * history.indexOf(h), ease: 'easeOut' }}
            />
            <span className={`text-[10px] ${isCurrent ? 'font-bold text-sky-700' : 'text-slate-400'}`}>
              {monthLabel(h.month)}{isCurrent ? ' ✦' : ''}
            </span>
          </div>
        );
      })}
      {/* budget line marker */}
      {budgetLine > 0 && (
        <div className="absolute inset-x-4" style={{ bottom: `${(budgetLine / max) * 96}px` }}>
          <div className="border-t border-dashed border-sky-400 w-full" />
        </div>
      )}
    </div>
  );
}

// ─── Edit budget dialog ────────────────────────────────────────────────────────

function EditBudgetDialog({
  current,
  suggestion,
  onSave,
  onClose,
}: {
  readonly current: number;
  readonly suggestion: number;
  readonly onSave: (limit: number) => Promise<void>;
  readonly onClose: () => void;
}) {
  const [value, setValue] = useState(current > 0 ? String(current) : '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function handleSave() {
    const n = parseMoney(value);
    if (n === null || n < 0) return;
    setSaving(true);
    haptic([15, 30, 15]);
    await onSave(n);
    setSaving(false);
  }

  function useSuggestion() {
    setValue(String(suggestion));
    haptic(10);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      >
        <h2 className="text-lg font-bold text-slate-800 mb-1">🎯 Presupuesto mensual</h2>
        <p className="text-sm text-slate-500 mb-5">
          Establece cuánto quieres gastar en el supermercado cada mes.
        </p>

        <label htmlFor="budget-limit" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Límite mensual
        </label>
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
          <input
            ref={inputRef}
            id="budget-limit"
            type="text"
                inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
            placeholder="Ej. 3000"
            className="w-full pl-7 pr-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-lg font-bold placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-300 transition"
          />
        </div>

        {suggestion > 0 && (
          <button
            type="button"
            onClick={useSuggestion}
            className="w-full text-sm text-sky-700 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 mb-5 hover:bg-sky-100 transition text-left flex items-center gap-2"
          >
            <span>💡</span>
            <span>
              Tu promedio de los últimos meses es <strong>{fmt(suggestion)}</strong> — usar como base
            </span>
          </button>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || value === ''}
            className="flex-1 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm transition disabled:opacity-50"
          >
            {saving ? 'Guardando…' : '✓ Guardar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function BudgetView({ initialData, initialScope = 'all' }: Props) {
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<ScopeFilter>(initialScope);

  /**
   * Las cuatro cifras del lado que se mira.
   *
   * Con «todo» son las mismas que trajo el servidor; al cambiar de pestaña se
   * recalculan con la MISMA funcion que uso el servidor, para que el titular y
   * la grafica de debajo no puedan discrepar.
   */
  const figures =
    scope === 'all'
      ? { spentThisMonth: data.spentThisMonth, avgMonthly: data.avgMonthly, percentUsed: data.percentUsed, remaining: data.remaining }
      : budgetFigures(data.history, data.monthlyLimit, scope);

  const status = getBudgetStatus(figures.percentUsed);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/budget', { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  async function saveLimit(limit: number) {
    await fetch('/api/budget', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyLimit: limit }),
    });
    // Setting a goal deserves a mini celebration
    playSound('levelup');
    burstAt(window.innerWidth / 2, window.innerHeight / 3, ['🎯', '💰', '✨']);
    setEditing(false);
    await refresh();
  }

  const currentMonth = new Date().toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  const currentKey = monthKeyOf(new Date());

  // Ventana de meses terminando en el ACTUAL, sin los meses vacíos del
  // inicio — la gráfica arranca en el primer mes con datos y sigue mes a mes.
  const historyWithCurrent = buildHistoryWindow(data.history).map((h) => ({
    ...h,
    // La grafica dibuja `total`, asi que se le da el importe del lado elegido:
    // una barra que sigue contando el negocio contradiria al titular de arriba.
    total: monthAmount(h, scope),
  }));

  /** Los totales de las pestañas, sobre los meses que se estan viendo. */
  const scopeSummary = summarizeByScope(
    buildHistoryWindow(data.history).map((h) => ({
      id: h.month,
      name: h.month,
      amount: h.total,
      // `summarizeByScope` piensa en porcentajes; aqui la parte del negocio ya
      // viene calculada, asi que se convierte a su porcentaje equivalente.
      businessShare: h.total > 0 ? ((h.total - h.personal) / h.total) * 100 : 0,
    })),
  );

  return (
    <div className="space-y-5 pb-20">
      {/* ─── Personal / Negocio ───────────────────────────────────────────
          Encima de todo: cambia el titular, el medidor y la grafica. */}
      <ScopeTabs value={scope} onChange={setScope} summary={scopeSummary} format={fmt} />

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-linear-to-br from-brand-700 to-brand-500 text-white rounded-2xl p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">💰 Presupuesto</h1>
            <p className="text-white/70 text-sm mt-0.5 capitalize">{currentMonth}</p>
          </div>
          <button
            type="button"
            onClick={() => { setEditing(true); haptic(12); }}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-xl text-xs font-semibold transition"
          >
            ✏️ {data.monthlyLimit > 0 ? 'Editar' : 'Establecer límite'}
          </button>
        </div>
      </div>

      {/* ─── Puente al Plan financiero ───────────────────────────────────────── */}
      <Link
        href="/plan"
        onClick={() => haptic(10)}
        className="group flex items-center gap-3 rounded-2xl border border-sky-200 dark:border-white/10 bg-linear-to-r from-sky-100 to-blue-100 dark:from-sky-500/10 dark:to-blue-500/5 p-4 transition hover:shadow-md"
      >
        <span className="text-2xl shrink-0" aria-hidden="true">🧭</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-black dark:text-white">
            ¿Tienes un viaje, una deuda o un proyecto?
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
            El Plan financiero calcula cuánto apartar cada mes y te da consejos para lograrlo.
          </p>
        </div>
        <span className="shrink-0 text-sky-500 group-hover:translate-x-1 transition-transform" aria-hidden="true">→</span>
      </Link>

      {/* ─── Radial gauge ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-5">
          {/* Arc */}
          <div className="relative w-36 h-36 shrink-0">
            {figures.percentUsed === null ? (
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
                <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="16" />
              </svg>
            ) : (
              <RadialArc pct={figures.percentUsed} color={status.arc} />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {figures.percentUsed !== null && (
                <motion.span
                  key={getGaugeEmoji(figures.percentUsed)}
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 14 }}
                  className="text-lg leading-none mb-0.5"
                  aria-hidden="true"
                >
                  {getGaugeEmoji(figures.percentUsed)}
                </motion.span>
              )}
              <motion.span
                key={Math.round(figures.spentThisMonth)}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="text-xl font-black text-slate-800 tabular-nums leading-none"
              >
                {fmt(figures.spentThisMonth)}
              </motion.span>
              <span className="text-[11px] text-slate-400 mt-1">gastado</span>
              {figures.percentUsed !== null && (
                <span className={`text-xs font-bold mt-1 ${status.color}`}>
                  {Math.round(figures.percentUsed)}%
                </span>
              )}
            </div>
          </div>

          {/* Stats column */}
          <div className="flex-1 space-y-3">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.color}${figures.percentUsed !== null && figures.percentUsed >= 100 ? ' animate-shake' : ''}`}>
              {figures.percentUsed !== null && figures.percentUsed >= 100 && '🚨 '}
              {figures.percentUsed !== null && figures.percentUsed >= 80 && figures.percentUsed < 100 && '⚠️ '}
              {(figures.percentUsed === null || figures.percentUsed < 80) && '✅ '}
              {status.label}
            </div>

            {data.monthlyLimit > 0 ? (
              <>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">Límite mensual</p>
                  <p className="text-base font-bold text-slate-700">{fmt(data.monthlyLimit)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">
                    {(figures.remaining ?? 0) >= 0 ? 'Disponible' : 'Exceso'}
                  </p>
                  <p className={`text-base font-bold ${(figures.remaining ?? 0) >= 0 ? 'text-sky-700' : 'text-blue-600'}`}>
                    {figures.remaining === null ? '—' : fmt(Math.abs(figures.remaining))}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-slate-500">
                  Sin límite establecido. Toca <strong>Establecer límite</strong> para activar el seguimiento.
                </p>
                {figures.avgMonthly > 0 && (
                  <p className="text-xs text-slate-400">
                    Tu promedio histórico: <strong className="text-slate-600">{fmt(figures.avgMonthly)}</strong>/mes
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar — game meter with money riding the tip (fire when over) */}
        {figures.percentUsed !== null && (
          <div className="mt-4">
            <div className="relative h-3 bg-slate-100 rounded-full">
              <motion.div
                className="progress-fun h-full rounded-full"
                style={{
                  ['--progress-from' as string]: status.arc,
                  ['--progress-to' as string]: status.arc,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(figures.percentUsed, 100)}%` }}
                transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
              />
              <span
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 text-sm leading-none drop-shadow-sm transition-all duration-1000 ease-out"
                style={{ left: `calc(${Math.min(Math.max(figures.percentUsed, 1), 97)}% - 7px)` }}
              >
                {figures.percentUsed >= 100 ? '🔥' : '💰'}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[11px] text-slate-400">$0</span>
              <span className="text-[11px] text-slate-400">{fmt(data.monthlyLimit)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Quick stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Este mes</p>
          <p className="text-xl font-black text-slate-800 tabular-nums">{fmt(figures.spentThisMonth)}</p>
          <p className="text-xs text-slate-400 mt-0.5">en supermercado</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-1">Promedio</p>
          <p className="text-xl font-black text-slate-800 tabular-nums">
            {figures.avgMonthly > 0 ? fmt(figures.avgMonthly) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">meses anteriores</p>
        </div>
      </div>

      {/* ─── History bars ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-700">📊 Historial de gasto</h2>
          {loading && (
            <span className="text-xs text-slate-400 animate-pulse">Actualizando…</span>
          )}
        </div>
        <div className="relative">
          <HistoryBars history={historyWithCurrent} budgetLine={data.monthlyLimit} currentKey={currentKey} />
        </div>
        {data.monthlyLimit > 0 && historyWithCurrent.some((h) => h.total > 0) && (
          <p className="text-[11px] text-slate-400 mt-2 text-center">
            Barras rojas = meses que superaron el límite de {fmt(data.monthlyLimit)}
          </p>
        )}
      </div>

      {/* ─── Tips ───────────────────────────────────────────────────────────── */}
      {data.monthlyLimit > 0 && figures.percentUsed !== null && (
        <BudgetTip pct={figures.percentUsed} remaining={figures.remaining} avgMonthly={figures.avgMonthly} />
      )}

      {/* ─── Edit dialog ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editing && (
          <EditBudgetDialog
            current={data.monthlyLimit}
            suggestion={figures.avgMonthly}
            onSave={saveLimit}
            onClose={() => setEditing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BudgetTip({
  pct,
  remaining,
  avgMonthly,
}: {
  readonly pct: number;
  readonly remaining: number | null;
  readonly avgMonthly: number;
}) {
  if (pct >= 100) {
    return (
      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <span className="text-2xl shrink-0">🚨</span>
        <div>
          <p className="text-sm font-bold text-blue-700">Presupuesto excedido</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Ya superaste tu límite mensual. Considera revisar qué productos puedes priorizar el próximo viaje.
          </p>
        </div>
      </div>
    );
  }
  if (pct >= 80) {
    return (
      <div className="flex gap-3 bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <span className="text-2xl shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-bold text-sky-700">Cerca del límite</p>
          <p className="text-xs text-sky-600 mt-0.5">
            Te quedan {remaining === null ? '—' : fmt(remaining)}. Revisa la lista antes de tu próxima compra.
          </p>
        </div>
      </div>
    );
  }
  if (pct < 50 && avgMonthly > 0) {
    return (
      <div className="flex gap-3 bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <span className="text-2xl shrink-0">✅</span>
        <div>
          <p className="text-sm font-bold text-sky-700">¡Vas muy bien!</p>
          <p className="text-xs text-sky-600 mt-0.5">
            Solo llevas el {Math.round(pct)}% de tu presupuesto. Sigues a buen ritmo para el mes.
          </p>
        </div>
      </div>
    );
  }
  return null;
}
