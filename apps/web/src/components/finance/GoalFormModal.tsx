'use client';

import { useMemo, useState } from 'react';
import { haptic } from '@/lib/haptic';
import ModalShell from './ModalShell';
import { DAYS_PER_MONTH, daysUntil, type FinanceGoal, type GoalKind } from '@/lib/finance-engine';
import { KIND_META, fmtMoney, fmtMoneyFine, todayKey } from './finance-ui';
import { parseMoney } from '@/lib/money-input';

export interface GoalPayload {
  name: string;
  emoji: string;
  kind: GoalKind;
  targetAmount: number;
  savedAmount: number;
  targetDate: string | null;
  monthlyOverride: number | null;
  status: 'active' | 'paused' | 'done';
  note: string | null;
  /** Tarjeta o crédito que esta meta liquida. `null` = una meta normal. */
 debtId: string | null;
}

interface Props {
 readonly goal: FinanceGoal | null;
 /** Tipo elegido desde los atajos, para abrir el formulario ya encaminado. */
 readonly preset?: GoalKind;
 /** Dinero libre mensual del plan — sirve para avisar si la meta no cabe. */
 readonly monthlyAvailable: number;
 /** Las deudas vivas, para poder enganchar la meta a una de ellas. */
 readonly debts: readonly { id: string; name: string; balance: number }[];
 readonly onSave: (payload: GoalPayload) => Promise<void>;
 readonly onClose: () => void;
}

interface Template {
 kind: GoalKind;
 emoji: string;
 label: string;
 placeholder: string;
}

const TEMPLATES: readonly Template[] = [
 { kind: 'trip', emoji: '✈️', label: 'Viaje', placeholder: 'Viaje a Argentina' },
 { kind: 'debt', emoji: '💳', label: 'Deuda', placeholder: 'Tarjeta de crédito' },
 { kind: 'project', emoji: '🏗️', label: 'Proyecto', placeholder: 'Remodelar la cocina' },
 { kind: 'purchase', emoji: '🛍️', label: 'Compra', placeholder: 'Laptop nueva' },
 { kind: 'emergency', emoji: '🛟', label: 'Fondo', placeholder: 'Fondo de emergencia' },
];

const EMOJI_CHOICES = ['✈️', '🏖️', '💳', '🏠', '🚗', '💻', '🎓', '💍', '🛟', '🎸', '🏥', '🎁'];

const inputCls =
 'w-full px-3 py-2.5 rounded-xl border border-sky-200 bg-white/70 text-black text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 transition';

const labelCls = 'block text-xs font-bold text-slate-600 mb-1.5';

export default function GoalFormModal({ goal, preset, monthlyAvailable, debts, onSave, onClose }: Props) {
 const editing = goal !== null;
 const [kind, setKind] = useState<GoalKind>(goal?.kind ?? preset ?? 'trip');
 const [emoji, setEmoji] = useState(
 goal?.emoji ?? (preset ? (TEMPLATES.find((t) => t.kind === preset)?.emoji ?? '🎯') : '✈️'),
 );
 const [name, setName] = useState(goal?.name ?? '');
 const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '');
 const [debtId, setDebtId] = useState<string | null>(goal?.debtId ?? null);
 /** La deuda enganchada manda sobre lo tecleado: sus cifras son la verdad. */
 const linked = debts.find((d) => d.id === debtId) ?? null;
 const [saved, setSaved] = useState(goal ? String(goal.savedAmount) : '');
 const [date, setDate] = useState(goal?.targetDate ?? '');
 const [override, setOverride] = useState(goal?.monthlyOverride ? String(goal.monthlyOverride) : '');
 const [note, setNote] = useState(goal?.note ?? '');
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const template = TEMPLATES.find((t) => t.kind === kind) ?? TEMPLATES[0];
 const meta = KIND_META[kind];

 // Vista previa en vivo: el usuario ve el esfuerzo mensual ANTES de guardar.
 const preview = useMemo(() => {
 const targetAmount = parseMoney(target);
 const savedAmount = parseMoney(saved) ?? 0;
 if (targetAmount === null || targetAmount <= 0) return null;

 const remaining = Math.max(0, targetAmount - savedAmount);
 if (remaining === 0) return { remaining, monthly: 0, weekly: 0, daily: 0, days: null, fits: true };

 const days = date ? daysUntil(date) : null;
 if (days === null) {
 const monthly = remaining / 12;
 return { remaining, monthly, weekly: monthly / 4.345, daily: monthly / DAYS_PER_MONTH, days: null, fits: monthly <= monthlyAvailable };
 }
 if (days <= 0) return { remaining, monthly: remaining, weekly: remaining, daily: remaining, days, fits: false };

 const monthly = remaining / (days / DAYS_PER_MONTH);
 return { remaining, monthly, weekly: (remaining / days) * 7, daily: remaining / days, days, fits: monthly <= monthlyAvailable };
 }, [target, saved, date, monthlyAvailable]);

 function pickTemplate(t: Template) {
 setKind(t.kind);
 setEmoji(t.emoji);
 haptic(8);
 }

 async function submit() {
 const targetAmount = parseMoney(target);
 if (!name.trim()) return setError('Ponle un nombre a tu meta');
 if (targetAmount === null || targetAmount <= 0) return setError('El monto objetivo debe ser mayor a 0');

 setError(null);
 setSaving(true);
 try {
 await onSave({
 name: name.trim(),
 emoji,
 kind,
 targetAmount,
 debtId,
 savedAmount: parseMoney(saved) ?? 0,
 targetDate: date || null,
 monthlyOverride: parseMoney(override),
 status: goal?.status ?? 'active',
 note: note.trim() || null,
 });
 } catch (err) {
 setError(err instanceof Error ? err.message : 'No se pudo guardar');
 } finally {
 // También en éxito: si el cierre del modal se retrasara, el botón debe
 // volver a estar utilizable en vez de quedarse en "Guardando…".
 setSaving(false);
 }
 }

 return (
 <ModalShell
 title={editing ? 'Editar meta' : 'Nueva meta'}
 emoji={emoji}
 headerClass={meta.gradient}
 onClose={onClose}
 footer={
 <div className="flex gap-3">
 <button
 type="button"
 onClick={onClose}
 className="flex-1 py-3 rounded-2xl border border-sky-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
 >
 Cancelar
 </button>
 <button
 type="button"
 onClick={() => void submit()}
 disabled={saving}
 className="flex-[1.4] py-3 rounded-2xl bg-linear-to-r from-sky-500 to-blue-500 hover:from-sky-600 hover:to-blue-600 text-white font-bold text-sm shadow-lg shadow-sky-500/20 transition disabled:opacity-50"
 >
 {saving ? 'Guardando…' : editing ? '✓ Guardar cambios' : '✨ Crear meta'}
 </button>
 </div>
 }
 >
 <div className="space-y-4">
 {/* Tipo de meta */}
 <div>
 <span className={labelCls}>Tipo de meta</span>
 <div className="grid grid-cols-5 gap-2">
 {TEMPLATES.map((t) => {
 const active = t.kind === kind;
 return (
 <button
 key={t.kind}
 type="button"
 onClick={() => pickTemplate(t)}
 className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-[11px] font-semibold transition ${
                    active
                      ? `${KIND_META[t.kind].chip} border-transparent shadow-sm scale-[1.03]`
                      : 'bg-white/70 border-sky-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden="true">{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nombre + emoji */}
        <div>
          <label className={labelCls} htmlFor="goal-name">¿Qué quieres lograr?</label>
          <input
            id="goal-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={template.placeholder}
            className={inputCls}
            maxLength={160}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { setEmoji(e); haptic(6); }}
                className={`w-8 h-8 rounded-xl text-base transition ${
                  emoji === e ? 'bg-sky-100 ring-2 ring-sky-300 scale-110' : 'bg-white/70 hover:bg-slate-100'
                }`}
                aria-label={`Usar ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* ─── La tarjeta que esta meta liquida ───────────────────────────
            Solo para metas de deuda, y solo si hay deudas que enganchar.

            Con enganche, las dos cifras de abajo dejan de escribirse a mano:
            se leen de la tarjeta. Eran dos copias del mismo dinero y derivaban
            solas — una meta llegó a decir «llevas $157» sobre una tarjeta que
            no había bajado un centavo. */}
        {kind === 'debt' && debts.length > 0 && (
          <div>
            <span className={labelCls}>¿Qué tarjeta estás pagando?</span>
            <div className="space-y-1.5">
              {debts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { haptic(6); setDebtId(debtId === d.id ? null : d.id); }}
                  aria-pressed={debtId === d.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    debtId === d.id
                      ? 'bg-sky-500 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-sky-200'
                  }`}
                >
                  <span className="min-w-0 truncate text-sm font-bold">{d.name}</span>
                  <span className="shrink-0 text-sm font-black tabular-nums">
                    {fmtMoneyFine(d.balance)}
                  </span>
                </button>
              ))}
            </div>
            {linked && (
              <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                El objetivo y lo abonado se leen de <strong>{linked.name}</strong>. Cada abono o
                consumo que registres en Deudas mueve esta meta solo.
              </p>
            )}
          </div>
        )}

        {/* Montos */}
        <div className={`grid grid-cols-2 gap-3 ${linked ? 'opacity-50' : ''}`}>
          <div>
            <label className={labelCls} htmlFor="goal-target">¿Cuánto cuesta?</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
              <input
                id="goal-target"
                type="text"
                inputMode="decimal"
                value={linked ? linked.balance.toFixed(2) : target}
                onChange={(e) => setTarget(e.target.value)}
                readOnly={linked !== null}
                placeholder="2300"
                className={`${inputCls} pl-7 font-bold`}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="goal-saved">Ya tengo</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
              <input
                id="goal-saved"
                type="text"
                inputMode="decimal"
                value={linked ? '0.00' : saved}
                onChange={(e) => setSaved(e.target.value)}
                readOnly={linked !== null}
                placeholder="0"
                className={`${inputCls} pl-7`}
              />
            </div>
          </div>
        </div>

        {/* Aquí había un selector de prioridad de tres estrellas. Se fue cuando
            el orden de la lista pasó a ser la prioridad: eran dos mandos para
            la misma columna, y el de las estrellas ganaba —bastaba editar el
            nombre de una meta para deshacer el orden que el usuario había
            armado arrastrando—. Ahora se dice de una sola forma, y es la que ya
            se ve: la meta que está más arriba es la que va primero. */}
        <div>
          <label className={labelCls} htmlFor="goal-date">¿Para cuándo?</label>
          <input
            id="goal-date"
            type="date"
            min={todayKey()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Vista previa del esfuerzo */}
        {preview && (
          <div
            className={`rounded-2xl border p-4 ${
              preview.remaining === 0
                ? 'bg-sky-50 border-sky-200'
                : preview.fits
                  ? 'bg-sky-50 border-sky-200'
                  : 'bg-sky-50 border-sky-200'
            }`}
          >
            {preview.remaining === 0 ? (
              <p className="text-sm font-bold text-sky-700">🎉 ¡Ya tienes el monto completo!</p>
            ) : (
              <>
                <p className="text-[11px] font-bold text-slate-500 mb-2">
                  Para lograrlo necesitas apartar
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'al mes', value: preview.monthly },
                    { label: 'por semana', value: preview.weekly },
                    { label: 'por día', value: preview.daily },
                  ].map((row) => (
                    <div key={row.label} className="rounded-xl bg-white/70 py-2">
                      <p className="text-base font-black text-black tabular-nums leading-tight">
                        {fmtMoneyFine(Math.round(row.value * 100) / 100)}
                      </p>
                      <p className="text-[11px] text-slate-500">{row.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-2.5 text-slate-600">
                  {preview.days === null
                    ? 'Sin fecha límite calculo un horizonte de 12 meses. Ponle fecha para un plan exacto.'
                    : preview.days <= 0
                      ? '⚠️ Esa fecha ya pasó — elige una futura.'
                      : preview.fits
                        ? `✅ Faltan ${preview.days} días y cabe en tus ${fmtMoney(monthlyAvailable)} libres al mes.`
                        : `⚠️ Faltan ${preview.days} días, pero excede tus ${fmtMoney(monthlyAvailable)} libres al mes. Te lo diré en el plan con opciones para lograrlo.`}
                </p>
              </>
            )}
          </div>
        )}

        {/* Avanzado */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-700 select-none">
            ⚙️ Opciones avanzadas
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelCls} htmlFor="goal-override">Aporte mensual fijo (opcional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                <input
                  id="goal-override"
                  type="text"
                  inputMode="decimal"
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  placeholder="Automático"
                  className={`${inputCls} pl-7`}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Si lo dejas vacío calculo el aporte según la fecha objetivo.
              </p>
            </div>
            <div>
              <label className={labelCls} htmlFor="goal-note">Nota</label>
              <textarea
                id="goal-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Vuelos + hotel + gastos"
                className={inputCls}
                maxLength={1000}
              />
            </div>
          </div>
        </details>

        {error && (
          <p className="text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
