'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { MonthlyPayment, CreatePaymentDto } from '@foody/types';
import { useRouter } from 'next/navigation';
import { XMarkIcon, PencilSquareIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  utilities: '💡',
  subscriptions: '📱',
  rent: '🏠',
  insurance: '🛡️',
  internet: '🌐',
  phone: '📞',
  streaming: '🎬',
  other: '💰',
};

const CATEGORIES = [
  { value: 'utilities', label: '💡', name: 'Servicios' },
  { value: 'rent', label: '🏠', name: 'Arriendo' },
  { value: 'internet', label: '🌐', name: 'Internet' },
  { value: 'phone', label: '📞', name: 'Teléfono' },
  { value: 'streaming', label: '🎬', name: 'Streaming' },
  { value: 'insurance', label: '🛡️', name: 'Seguros' },
  { value: 'subscriptions', label: '📱', name: 'Suscripciones' },
  { value: 'other', label: '💰', name: 'Otro' },
];

const CURRENCIES = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP', 'PEN'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildNotifyDisplay(days: number): { value: string; unit: 'days' | 'months' } {
  if (days > 0 && days % 30 === 0) return { value: String(days / 30), unit: 'months' };
  if (days > 0) return { value: String(days), unit: 'days' };
  return { value: '', unit: 'days' };
}

function buildEditState(payment: MonthlyPayment): {
  form: CreatePaymentDto;
  notifyValue: string;
  notifyUnit: 'days' | 'months';
} {
  const { value, unit } = buildNotifyDisplay(payment.notificationDaysBefore);
  return {
    form: {
      name: payment.name,
      amount: payment.amount,
      dueDay: payment.dueDay,
      currency: payment.currency,
      category: payment.category,
      notificationDaysBefore: payment.notificationDaysBefore,
      description: payment.description ?? '',
    },
    notifyValue: value,
    notifyUnit: unit,
  };
}

function formatNotifyDays(days: number): string {
  if (days <= 0) return '—';
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} mes${months === 1 ? '' : 'es'}`;
  }
  return `${days} día${days === 1 ? '' : 's'}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'view' | 'edit' | 'confirm-delete';
type InlineField = 'dueDay' | 'notify' | null;

interface Props {
  readonly payment: MonthlyPayment;
  readonly isPaid: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPaidToggle: () => void;
  readonly onUpdated: (p: MonthlyPayment) => void;
  readonly onDeleted: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentDetailSheet({
  payment,
  isPaid,
  open,
  onClose,
  onPaidToggle,
  onUpdated,
  onDeleted,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [currentPayment, setCurrentPayment] = useState<MonthlyPayment>(payment);

  // Keep in sync when parent prop changes
  useEffect(() => { setCurrentPayment(payment); }, [payment]);
  const [mode, setMode] = useState<Mode>('view');
  const [inlineField, setInlineField] = useState<InlineField>(null);
  const [inlineDueDay, setInlineDueDay] = useState('');
  const [inlineNotifyValue, setInlineNotifyValue] = useState('');
  const [inlineNotifyUnit, setInlineNotifyUnit] = useState<'days' | 'months'>('days');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [form, setForm] = useState<CreatePaymentDto>(() => buildEditState(payment).form);
  const [notifyUnit, setNotifyUnit] = useState<'days' | 'months'>(() => buildEditState(payment).notifyUnit);
  const [notifyValue, setNotifyValue] = useState<string>(() => buildEditState(payment).notifyValue);

  // Sync form when payment prop changes
  useEffect(() => {
    const { form: f, notifyValue: nv, notifyUnit: nu } = buildEditState(payment);
    setForm(f);
    setNotifyValue(nv);
    setNotifyUnit(nu);
    setInlineField(null);
  }, [payment]);

  // Open / close the native dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setMode('view');
      setInlineField(null);
      setError(null);
    }
    if (!open && el.open) el.close();
  }, [open]);

  // Close on backdrop click
  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open, onClose]);

  const handleSave = useCallback(
    async (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSaving(true);
      setError(null);
      const parsedNotify = notifyValue === '' ? 0 : Number.parseInt(notifyValue, 10);
      const daysBeforeValue = notifyUnit === 'months' ? parsedNotify * 30 : parsedNotify;
      const body: CreatePaymentDto = { ...form, notificationDaysBefore: daysBeforeValue };
      try {
        const res = await fetch(`/api/payments/${currentPayment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json()) as { message?: string };
          throw new Error(data.message ?? 'Error al guardar');
        }
        const updated = (await res.json()) as MonthlyPayment;
        setCurrentPayment(updated);
        onUpdated(updated);
        setMode('view');
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [form, notifyValue, notifyUnit, currentPayment.id, onUpdated, router],
  );

  function handleDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/payments/${currentPayment.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        onClose();
        onDeleted();
        router.refresh();
      }
    });
  }

  const icon = CATEGORY_ICONS[currentPayment.category ?? 'other'] ?? '💰';
  const catName = CATEGORIES.find((c) => c.value === currentPayment.category)?.name ?? currentPayment.category;

  const handleCategoryChange = useCallback((value: string) => {
    setForm((f) => ({ ...f, category: value }));
  }, []);

  const openInlineDueDay = useCallback(() => {
    setInlineDueDay(String(currentPayment.dueDay));
    setInlineField('dueDay');
  }, [currentPayment.dueDay]);

  const openInlineNotify = useCallback(() => {
    const { value, unit } = buildNotifyDisplay(currentPayment.notificationDaysBefore);
    setInlineNotifyValue(value);
    setInlineNotifyUnit(unit);
    setInlineField('notify');
  }, [currentPayment.notificationDaysBefore]);

  const saveInlineField = useCallback(
    async (field: InlineField) => {
      if (!field) return;
      setInlineSaving(true);
      let patch: Partial<CreatePaymentDto> = {};
      if (field === 'dueDay') {
        const day = Number.parseInt(inlineDueDay, 10);
        if (Number.isNaN(day) || day < 1 || day > 31) { setInlineSaving(false); return; }
        patch = { dueDay: day };
      } else {
        const parsed = inlineNotifyValue === '' ? 0 : Number.parseInt(inlineNotifyValue, 10);
        patch = { notificationDaysBefore: inlineNotifyUnit === 'months' ? parsed * 30 : parsed };
      }
      try {
        const res = await fetch(`/api/payments/${currentPayment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = (await res.json()) as MonthlyPayment;
          setCurrentPayment(updated);
          onUpdated(updated);
          setInlineField(null);
          router.refresh();
        }
      } finally {
        setInlineSaving(false);
      }
    },
    [inlineDueDay, inlineNotifyValue, inlineNotifyUnit, currentPayment.id, onUpdated, router],
  );

  // ── View mode ────────────────────────────────────────────────────────────
  function renderView() {
    return (
      <>
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ backgroundColor: isPaid ? '#10B981' : '#6366F1' }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg leading-tight truncate">{currentPayment.name}</h2>
            <p className="text-gray-400 text-sm mt-0.5">{catName}</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-400 hover:bg-white/20 transition shrink-0"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Amount */}
        <div className="bg-white/5 rounded-2xl p-4 mb-4">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Monto mensual</p>
          <p className="text-white text-3xl font-extrabold">
            {currentPayment.currency} {currentPayment.amount.toFixed(2)}
          </p>
        </div>

        {/* Info grid — tappable cells */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Due day cell */}
          {inlineField === 'dueDay' ? (
            <form
              className="bg-brand-500/15 border border-brand-500/40 rounded-xl p-3 flex flex-col gap-2"
              onSubmit={(e) => { e.preventDefault(); saveInlineField('dueDay'); }}
            >
              <p className="text-brand-300 text-xs font-semibold">Día de vencimiento</p>
              <input
                autoFocus
                type="number"
                min={1}
                max={31}
                value={inlineDueDay}
                onChange={(e) => setInlineDueDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={inlineSaving}
                  className="flex-1 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold disabled:opacity-50 transition"
                >
                  {inlineSaving ? '…' : '✓'}
                </button>
                <button
                  type="button"
                  onClick={() => setInlineField(null)}
                  className="flex-1 py-1.5 rounded-lg bg-white/10 text-gray-400 text-xs font-semibold transition hover:bg-white/20"
                >
                  ✕
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={openInlineDueDay}
              className="bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl p-3 text-left transition w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group"
            >
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center justify-between">
                Día de vencimiento
                <PencilSquareIcon className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
              </p>
              <p className="text-white font-bold">Día {currentPayment.dueDay} / mes</p>
            </button>
          )}

          {/* Notify cell */}
          {inlineField === 'notify' ? (
            <form
              className="bg-brand-500/15 border border-brand-500/40 rounded-xl p-3 flex flex-col gap-2"
              onSubmit={(e) => { e.preventDefault(); saveInlineField('notify'); }}
            >
              <p className="text-brand-300 text-xs font-semibold">Avisar antes</p>
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={inlineNotifyValue}
                  onChange={(e) => setInlineNotifyValue(e.target.value)}
                  placeholder="—"
                  className="w-full min-w-0 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <select
                  value={inlineNotifyUnit}
                  onChange={(e) => setInlineNotifyUnit(e.target.value as 'days' | 'months')}
                  className="px-2 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-xs shrink-0 focus:outline-none"
                >
                  <option value="days" className="bg-gray-900">días</option>
                  <option value="months" className="bg-gray-900">meses</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={inlineSaving}
                  className="flex-1 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold disabled:opacity-50 transition"
                >
                  {inlineSaving ? '…' : '✓'}
                </button>
                <button
                  type="button"
                  onClick={() => setInlineField(null)}
                  className="flex-1 py-1.5 rounded-lg bg-white/10 text-gray-400 text-xs font-semibold transition hover:bg-white/20"
                >
                  ✕
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={openInlineNotify}
              className="bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl p-3 text-left transition w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group"
            >
              <p className="text-gray-400 text-xs font-medium mb-1 flex items-center justify-between">
                Avisar antes
                <PencilSquareIcon className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
              </p>
              <p className="text-white font-bold">
                {formatNotifyDays(currentPayment.notificationDaysBefore)}
              </p>
            </button>
          )}
        </div>

        {/* Description */}
        {currentPayment.description && (
          <div className="bg-white/5 rounded-xl p-3 mb-4">
            <p className="text-gray-400 text-xs font-medium mb-1">Notas</p>
            <p className="text-white text-sm leading-relaxed">{currentPayment.description}</p>
          </div>
        )}

        {/* Status badge */}
        <div className="mb-5">
          {isPaid ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300">
              <CheckCircleIcon className="w-4 h-4" />
              Pagado este mes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300">
              ⏰ Pendiente · En {plural(currentPayment.daysUntilDue, 'día')}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPaidToggle}
            className={`w-full py-3 rounded-2xl font-bold text-sm transition ${
              isPaid
                ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                : 'bg-emerald-500 text-white hover:bg-emerald-600'
            }`}
          >
            {isPaid ? '↩ Desmarcar como pagado' : '✓ Marcar como pagado'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setError(null); setMode('edit'); }}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/10 text-gray-200 hover:bg-white/20 font-semibold text-sm transition"
            >
              <PencilSquareIcon className="w-4 h-4" />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setMode('confirm-delete')}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 font-semibold text-sm transition"
            >
              <TrashIcon className="w-4 h-4" />
              Eliminar
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Confirm delete mode ─────────────────────────────────────────────────
  function renderConfirmDelete() {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center text-3xl">
          🗑️
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">¿Eliminar pago?</h2>
          <p className="text-gray-400 text-sm mt-1">
            Se eliminará <span className="text-white font-semibold">"{currentPayment.name}"</span> permanentemente.
          </p>
        </div>
        <div className="w-full flex flex-col gap-2 mt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="w-full py-3 rounded-2xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 transition disabled:opacity-50"
          >
            {isPending ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="w-full py-3 rounded-2xl bg-white/10 text-gray-300 font-semibold text-sm hover:bg-white/20 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  function renderEdit() {
    return (
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {/* Edit header */}
        <div className="flex items-center gap-3 mb-1">
          <button
            type="button"
            onClick={() => setMode('view')}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-400 hover:bg-white/20 transition shrink-0"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <h2 className="text-white font-bold text-lg">Editar pago</h2>
        </div>

        {error && (
          <div className="px-4 py-3 bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
            {error}
          </div>
        )}

        {/* Nombre */}
        <div>
          <label htmlFor="edit-payment-name" className="block text-xs font-semibold text-gray-400 mb-1.5">
            Nombre <span className="text-brand-400">*</span>
          </label>
          <input
            id="edit-payment-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Netflix, Renta, Luz…"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm"
          />
        </div>

        {/* Monto + Moneda */}
        <div>
          <label htmlFor="edit-payment-amount" className="block text-xs font-semibold text-gray-400 mb-1.5">
            Monto <span className="text-brand-400">*</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">$</span>
              <input
                id="edit-payment-amount"
                required
                type="number"
                min={0}
                step="0.01"
                value={form.amount === 0 ? '' : form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: Number.parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm"
              />
            </div>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="px-3 py-3 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm min-w-20"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-gray-900">{c}</option>
              ))}
              <option value="OTHER" className="bg-gray-900">Otra</option>
            </select>
          </div>
        </div>

        {/* Día vencimiento + Avisar antes */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-payment-due-day" className="block text-xs font-semibold text-gray-400 mb-1.5">
              Día vencimiento
            </label>
            <div className="relative">
              <input
                id="edit-payment-due-day"
                required
                type="number"
                min={1}
                max={31}
                value={form.dueDay}
                onChange={(e) => setForm((f) => ({ ...f, dueDay: Number.parseInt(e.target.value, 10) || 1 }))}
                className="w-full px-4 py-3 pr-10 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs select-none">/mes</span>
            </div>
          </div>
          <div>
            <label htmlFor="edit-notify-value" className="block text-xs font-semibold text-gray-400 mb-1.5">
              Avisar antes
            </label>
            <div className="flex gap-1.5">
              <input
                id="edit-notify-value"
                type="number"
                min={0}
                value={notifyValue}
                onChange={(e) => setNotifyValue(e.target.value)}
                placeholder="—"
                className="w-full px-3 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm min-w-0"
              />
              <select
                value={notifyUnit}
                onChange={(e) => setNotifyUnit(e.target.value as 'days' | 'months')}
                className="px-2 py-3 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-xs shrink-0"
              >
                <option value="days" className="bg-gray-900">días</option>
                <option value="months" className="bg-gray-900">meses</option>
              </select>
            </div>
          </div>
        </div>

        {/* Categoría */}
        <div>
          <span className="block text-xs font-semibold text-gray-400 mb-2">Categoría</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                aria-pressed={form.category === cat.value}
                onClick={() => handleCategoryChange(cat.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  form.category === cat.value
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:border-brand-400 hover:bg-brand-500/10'
                }`}
              >
                <span>{cat.label}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label htmlFor="edit-payment-description" className="block text-xs font-semibold text-gray-400 mb-1.5">
            Notas <span className="text-gray-500 font-normal">(opcional)</span>
          </label>
          <textarea
            id="edit-payment-description"
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Ej: Incluye cuenta familiar…"
            rows={2}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-sm resize-none"
          />
        </div>

        {/* Save / Cancel */}
        <div className="flex flex-col gap-2 mt-1">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 transition disabled:opacity-50"
          >
            {saving ? 'Guardando…' : '💾 Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="w-full py-3 rounded-2xl bg-white/10 text-gray-300 font-semibold text-sm hover:bg-white/20 transition"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="fixed inset-0 flex items-end sm:items-center justify-center pointer-events-none">
        <section className="pointer-events-auto w-full max-w-sm bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-fade-up overflow-y-auto max-h-[92dvh] p-5">
          {mode === 'view' && renderView()}
          {mode === 'edit' && renderEdit()}
          {mode === 'confirm-delete' && renderConfirmDelete()}
        </section>
      </div>
    </dialog>
  );
}
