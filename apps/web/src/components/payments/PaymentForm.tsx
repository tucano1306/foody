'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreatePaymentDto } from '@foody/types';

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

export default function PaymentForm() {
  const router = useRouter();
  const [form, setForm] = useState<CreatePaymentDto>({
    name: '',
    amount: 0,
    dueDay: 1,
    currency: 'MXN',
    category: 'other',
    description: '',
    isVariableAmount: false,
    isAutoPay: false,
  });
  const [notifyValue, setNotifyValue] = useState('');
  const [notifyUnit, setNotifyUnit] = useState<'days' | 'months'>('days');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        setError('El nombre es obligatorio');
        setSaving(false);
        return;
      }

      if (!form.amount || form.amount <= 0) {
        setError('El monto debe ser mayor a cero');
        setSaving(false);
        return;
      }

      const parsedNotify = notifyValue === '' ? 0 : Number.parseInt(notifyValue, 10);
      const safeNotify = Number.isNaN(parsedNotify) ? 0 : parsedNotify;
      const daysBeforeValue = notifyUnit === 'months' ? safeNotify * 30 : safeNotify;
      const payload = { ...form, name: trimmedName, notificationDaysBefore: daysBeforeValue };

      const res = await fetch(`/api/proxy/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? 'Error al guardar');
      }

      router.push('/payments');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ─── Nombre ──────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="payment-name" className="block text-sm font-semibold text-stone-700 mb-1.5">
          Nombre <span className="text-brand-500">*</span>
        </label>
        <input
          id="payment-name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Netflix, Renta, Luz…"
          className="w-full px-4 py-3 rounded-2xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition text-base"
        />
      </div>

      {/* ─── Monto + Moneda ──────────────────────────────────────────────── */}
      <div>
        <label htmlFor="payment-amount" className="block text-sm font-semibold text-stone-700 mb-1.5">
          {form.isVariableAmount ? 'Monto estimado' : 'Monto'} <span className="text-brand-500">*</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-medium text-sm select-none">$</span>
            <input
              id="payment-amount"
              required
              type="number"
              min={0.01}
              step="0.01"
              value={form.amount === 0 ? '' : form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: Number.parseFloat(e.target.value) || 0 }))}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-3 rounded-2xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition text-base"
            />
          </div>
          <select
            id="payment-currency"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            className="px-3 py-3 rounded-2xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition bg-white font-medium text-sm min-w-20"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="OTHER">Otra</option>
          </select>
        </div>

        {/* Variable amount toggle */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, isVariableAmount: !f.isVariableAmount }))}
          aria-pressed={form.isVariableAmount}
          className={`mt-2 w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition ${
            form.isVariableAmount
              ? 'bg-amber-50 border-amber-300'
              : 'bg-white border-stone-200 hover:border-stone-300'
          }`}
        >
          <div
            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition ${
              form.isVariableAmount ? 'bg-amber-500 text-white' : 'bg-stone-100 text-transparent border border-stone-300'
            }`}
          >
            ✓
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
              ⚡ Monto variable (por consumo)
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              Ej: luz, agua, gas. El monto del recibo cambia cada mes; al pagar te pediremos el valor exacto.
            </p>
          </div>
        </button>

        {/* Auto-pay toggle */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, isAutoPay: !f.isAutoPay }))}
          aria-pressed={form.isAutoPay}
          className={`mt-2 w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition ${
            form.isAutoPay
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white border-stone-200 hover:border-stone-300'
          }`}
        >
          <div
            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition ${
              form.isAutoPay ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-transparent border border-stone-300'
            }`}
          >
            ✓
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
              🤖 Pago automatizado
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              El pago se cobra automáticamente (domiciliación, débito). La app lo marcará como pagado el día de vencimiento y te avisará.
            </p>
          </div>
        </button>
      </div>

      {/* ─── Día vencimiento + Notificación ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="payment-due-day" className="block text-sm font-semibold text-stone-700 mb-1.5">
            Día de vencimiento
          </label>
          <div className="relative">
            <input
              id="payment-due-day"
              required
              type="number"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(e) => setForm((f) => ({ ...f, dueDay: Number.parseInt(e.target.value, 10) || 1 }))}
              className="w-full px-4 py-3 rounded-2xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition text-base"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-xs select-none">/ mes</span>
          </div>
          <p className="text-xs text-stone-400 mt-1">Entre 1 y 31</p>
        </div>
        <div>
          <label htmlFor="payment-notify-value" className="block text-sm font-semibold text-stone-700 mb-1.5">
            Avisar antes
          </label>
          <div className="flex gap-1.5">
            <input
              id="payment-notify-value"
              type="number"
              min={0}
              value={notifyValue}
              onChange={(e) => setNotifyValue(e.target.value)}
              placeholder="—"
              className="w-full px-3 py-3 rounded-2xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition text-base min-w-0"
            />
            <select
              value={notifyUnit}
              onChange={(e) => setNotifyUnit(e.target.value as 'days' | 'months')}
              className="px-2 py-3 rounded-2xl border border-stone-200 text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition bg-white text-xs font-medium shrink-0"
            >
              <option value="days">días</option>
              <option value="months">meses</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Categoría chips ─────────────────────────────────────────────── */}
      <div>
        <span className="block text-sm font-semibold text-stone-700 mb-2">Categoría</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              aria-pressed={form.category === cat.value}
              onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                form.category === cat.value
                  ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                  : 'bg-white border-stone-200 text-stone-600 hover:border-brand-300 hover:bg-brand-50'
              }`}
            >
              <span>{cat.label}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Notas / Comentarios ─────────────────────────────────────────── */}
      <div>
        <label htmlFor="payment-description" className="block text-sm font-semibold text-stone-700 mb-1.5">
          Notas{' '}
          <span className="ml-1.5 text-xs font-normal text-stone-400">(opcional)</span>
        </label>
        <textarea
          id="payment-description"
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Ej: Incluye cuenta familiar, vence el día 15 cada mes…"
          rows={3}
          className="w-full px-4 py-3 rounded-2xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition text-sm resize-none"
        />
      </div>

      {/* ─── Submit ──────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={saving}
        className="btn-energy w-full py-3.5 rounded-2xl text-base font-semibold disabled:opacity-50"
      >
        {saving ? 'Guardando…' : '＋ Agregar pago'}
      </button>
    </form>
  );
}
