'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreatePaymentDto } from '@foody/types';

const CATEGORIES = [
  { value: 'utilities', label: '💡 Servicios' },
  { value: 'rent', label: '🏠 Arriendo' },
  { value: 'internet', label: '🌐 Internet' },
  { value: 'phone', label: '📞 Teléfono' },
  { value: 'streaming', label: '🎬 Streaming' },
  { value: 'insurance', label: '🛡️ Seguros' },
  { value: 'subscriptions', label: '📱 Suscripciones' },
  { value: 'other', label: '💰 Otro' },
];

export default function PaymentForm() {
  const router = useRouter();
  const [form, setForm] = useState<CreatePaymentDto>({
    name: '',
    amount: 0,
    dueDay: 1,
    currency: 'USD',
    category: 'other',
    notificationDaysBefore: 3,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/proxy/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="payment-name" className="block text-sm font-medium text-stone-700 mb-1">Nombre *</label>
        <input
          id="payment-name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Netflix"
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="payment-amount" className="block text-sm font-medium text-stone-700 mb-1">Monto *</label>
          <input
            id="payment-amount"
            required
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: Number.parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        </div>
        <div>
          <label htmlFor="payment-currency" className="block text-sm font-medium text-stone-700 mb-1">Moneda</label>
          <input
            id="payment-currency"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            maxLength={5}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition uppercase"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="payment-due-day" className="block text-sm font-medium text-stone-700 mb-1">
            Día de vencimiento (1–31)
          </label>
          <input
            id="payment-due-day"
            required
            type="number"
            min={1}
            max={31}
            value={form.dueDay}
            onChange={(e) => setForm((f) => ({ ...f, dueDay: Number.parseInt(e.target.value, 10) || 1 }))}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        </div>
        <div>
          <label htmlFor="payment-notify-days" className="block text-sm font-medium text-stone-700 mb-1">
            Notificar días antes
          </label>
          <input
            id="payment-notify-days"
            type="number"
            min={0}
            max={30}
            value={form.notificationDaysBefore}
            onChange={(e) => setForm((f) => ({ ...f, notificationDaysBefore: Number.parseInt(e.target.value, 10) || 3 }))}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        </div>
      </div>

      <div>
        <label htmlFor="payment-category" className="block text-sm font-medium text-stone-700 mb-1">Categoría</label>
        <select
          id="payment-category"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition bg-white"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="btn-energy w-full py-3 rounded-xl disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Agregar pago'}
      </button>
    </form>
  );
}
