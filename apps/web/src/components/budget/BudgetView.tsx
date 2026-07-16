'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { haptic } from '@/lib/haptic';
import { playSound } from '@/lib/sound';
import { burstAt } from '@/lib/fx';
import { buildHistoryWindow, monthKeyOf } from '@/lib/budget-history';
import type { BudgetMonthEntry as MonthEntry } from '@/lib/budget-history';

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
  if (pct === null) return { label: 'Sin límite', color: 'text-stone-500', bg: 'bg-stone-100', arc: '#a8a29e' };
  if (pct >= 100) return { label: '¡Excedido!', color: 'text-red-600', bg: 'bg-red-50', arc: '#ef4444' };
  if (pct >= 80) return { label: 'Atención', color: 'text-amber-600', bg: 'bg-amber-50', arc: '#f59e0b' };
  return { label: 'Bajo control', color: 'text-market-700', bg: 'bg-market-50', arc: '#16a34a' };
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
      <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="#e7e5e4" strokeWidth="16" />
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
      <p className="text-center text-xs text-stone-400 py-4">
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
            <span className={`text-[10px] tabular-nums ${isCurrent ? 'font-bold text-stone-700' : 'font-semibold text-stone-500'}`}>{fmt(h.total)}</span>
            <motion.div
              className={`w-full rounded-t-md ${overBudget ? 'bg-red-400' : isCurrent ? 'bg-market-500' : 'bg-market-400'}`}
              style={{ height: 0 }}
              animate={{ height: `${Math.max(heightPct, 4)}%` }}
              transition={{ duration: 0.7, delay: 0.05 * history.indexOf(h), ease: 'easeOut' }}
            />
            <span className={`text-[10px] ${isCurrent ? 'font-bold text-market-700' : 'text-stone-400'}`}>
              {monthLabel(h.month)}{isCurrent ? ' ✦' : ''}
            </span>
          </div>
        );
      })}
      {/* budget line marker */}
      {budgetLine > 0 && (
        <div className="absolute inset-x-4" style={{ bottom: `${(budgetLine / max) * 96}px` }}>
          <div className="border-t border-dashed border-amber-400 w-full" />
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
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n < 0) return;
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
        <h2 className="text-lg font-bold text-stone-800 mb-1">🎯 Presupuesto mensual</h2>
        <p className="text-sm text-stone-500 mb-5">
          Establece cuánto quieres gastar en el supermercado cada mes.
        </p>

        <label htmlFor="budget-limit" className="block text-sm font-semibold text-stone-700 mb-1.5">
          Límite mensual
        </label>
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold">$</span>
          <input
            ref={inputRef}
            id="budget-limit"
            type="number"
            min="0"
            step="100"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
            placeholder="Ej. 3000"
            className="w-full pl-7 pr-3 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 text-lg font-bold placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
          />
        </div>

        {suggestion > 0 && (
          <button
            type="button"
            onClick={useSuggestion}
            className="w-full text-sm text-market-700 bg-market-50 border border-market-200 rounded-xl px-3 py-2 mb-5 hover:bg-market-100 transition text-left flex items-center gap-2"
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
            className="flex-1 py-3 rounded-2xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || value === ''}
            className="flex-1 py-3 rounded-2xl bg-market-600 hover:bg-market-700 text-white font-bold text-sm transition disabled:opacity-50"
          >
            {saving ? 'Guardando…' : '✓ Guardar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function BudgetView({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const status = getBudgetStatus(data.percentUsed);

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
  const historyWithCurrent = buildHistoryWindow(data.history);

  return (
    <div className="space-y-5 pb-20">
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

      {/* ─── Radial gauge ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
        <div className="flex items-center gap-5">
          {/* Arc */}
          <div className="relative w-36 h-36 shrink-0">
            {data.percentUsed === null ? (
              <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90" aria-hidden="true">
                <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="#e7e5e4" strokeWidth="16" />
              </svg>
            ) : (
              <RadialArc pct={data.percentUsed} color={status.arc} />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {data.percentUsed !== null && (
                <motion.span
                  key={getGaugeEmoji(data.percentUsed)}
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 14 }}
                  className="text-lg leading-none mb-0.5"
                  aria-hidden="true"
                >
                  {getGaugeEmoji(data.percentUsed)}
                </motion.span>
              )}
              <motion.span
                key={Math.round(data.spentThisMonth)}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="text-xl font-black text-stone-800 tabular-nums leading-none"
              >
                {fmt(data.spentThisMonth)}
              </motion.span>
              <span className="text-[11px] text-stone-400 mt-1">gastado</span>
              {data.percentUsed !== null && (
                <span className={`text-xs font-bold mt-1 ${status.color}`}>
                  {Math.round(data.percentUsed)}%
                </span>
              )}
            </div>
          </div>

          {/* Stats column */}
          <div className="flex-1 space-y-3">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.color}${data.percentUsed !== null && data.percentUsed >= 100 ? ' animate-shake' : ''}`}>
              {data.percentUsed !== null && data.percentUsed >= 100 && '🚨 '}
              {data.percentUsed !== null && data.percentUsed >= 80 && data.percentUsed < 100 && '⚠️ '}
              {(data.percentUsed === null || data.percentUsed < 80) && '✅ '}
              {status.label}
            </div>

            {data.monthlyLimit > 0 ? (
              <>
                <div>
                  <p className="text-[11px] text-stone-400 uppercase tracking-wide">Límite mensual</p>
                  <p className="text-base font-bold text-stone-700">{fmt(data.monthlyLimit)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-400 uppercase tracking-wide">
                    {(data.remaining ?? 0) >= 0 ? 'Disponible' : 'Exceso'}
                  </p>
                  <p className={`text-base font-bold ${(data.remaining ?? 0) >= 0 ? 'text-market-700' : 'text-red-600'}`}>
                    {data.remaining === null ? '—' : fmt(Math.abs(data.remaining))}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-stone-500">
                  Sin límite establecido. Toca <strong>Establecer límite</strong> para activar el seguimiento.
                </p>
                {data.avgMonthly > 0 && (
                  <p className="text-xs text-stone-400">
                    Tu promedio histórico: <strong className="text-stone-600">{fmt(data.avgMonthly)}</strong>/mes
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress bar — game meter with money riding the tip (fire when over) */}
        {data.percentUsed !== null && (
          <div className="mt-4">
            <div className="relative h-3 bg-stone-100 rounded-full">
              <motion.div
                className="progress-fun h-full rounded-full"
                style={{
                  ['--progress-from' as string]: status.arc,
                  ['--progress-to' as string]: status.arc,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(data.percentUsed, 100)}%` }}
                transition={{ duration: 1, ease: [0.22, 0.61, 0.36, 1] }}
              />
              <span
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 text-sm leading-none drop-shadow-sm transition-all duration-1000 ease-out"
                style={{ left: `calc(${Math.min(Math.max(data.percentUsed, 1), 97)}% - 7px)` }}
              >
                {data.percentUsed >= 100 ? '🔥' : '💰'}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[11px] text-stone-400">$0</span>
              <span className="text-[11px] text-stone-400">{fmt(data.monthlyLimit)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Quick stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
          <p className="text-[11px] text-stone-400 uppercase tracking-wide mb-1">Este mes</p>
          <p className="text-xl font-black text-stone-800 tabular-nums">{fmt(data.spentThisMonth)}</p>
          <p className="text-xs text-stone-400 mt-0.5">en supermercado</p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4">
          <p className="text-[11px] text-stone-400 uppercase tracking-wide mb-1">Promedio</p>
          <p className="text-xl font-black text-stone-800 tabular-nums">
            {data.avgMonthly > 0 ? fmt(data.avgMonthly) : '—'}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">meses anteriores</p>
        </div>
      </div>

      {/* ─── History bars ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-stone-700">📊 Historial de gasto</h2>
          {loading && (
            <span className="text-xs text-stone-400 animate-pulse">Actualizando…</span>
          )}
        </div>
        <div className="relative">
          <HistoryBars history={historyWithCurrent} budgetLine={data.monthlyLimit} currentKey={currentKey} />
        </div>
        {data.monthlyLimit > 0 && historyWithCurrent.some((h) => h.total > 0) && (
          <p className="text-[11px] text-stone-400 mt-2 text-center">
            Barras rojas = meses que superaron el límite de {fmt(data.monthlyLimit)}
          </p>
        )}
      </div>

      {/* ─── Tips ───────────────────────────────────────────────────────────── */}
      {data.monthlyLimit > 0 && data.percentUsed !== null && (
        <BudgetTip pct={data.percentUsed} remaining={data.remaining} avgMonthly={data.avgMonthly} />
      )}

      {/* ─── Edit dialog ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editing && (
          <EditBudgetDialog
            current={data.monthlyLimit}
            suggestion={data.avgMonthly}
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
      <div className="flex gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
        <span className="text-2xl shrink-0">🚨</span>
        <div>
          <p className="text-sm font-bold text-red-700">Presupuesto excedido</p>
          <p className="text-xs text-red-600 mt-0.5">
            Ya superaste tu límite mensual. Considera revisar qué productos puedes priorizar el próximo viaje.
          </p>
        </div>
      </div>
    );
  }
  if (pct >= 80) {
    return (
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <span className="text-2xl shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-bold text-amber-700">Cerca del límite</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Te quedan {remaining === null ? '—' : fmt(remaining)}. Revisa la lista antes de tu próxima compra.
          </p>
        </div>
      </div>
    );
  }
  if (pct < 50 && avgMonthly > 0) {
    return (
      <div className="flex gap-3 bg-market-50 border border-market-200 rounded-2xl p-4">
        <span className="text-2xl shrink-0">✅</span>
        <div>
          <p className="text-sm font-bold text-market-700">¡Vas muy bien!</p>
          <p className="text-xs text-market-600 mt-0.5">
            Solo llevas el {Math.round(pct)}% de tu presupuesto. Sigues a buen ritmo para el mes.
          </p>
        </div>
      </div>
    );
  }
  return null;
}
