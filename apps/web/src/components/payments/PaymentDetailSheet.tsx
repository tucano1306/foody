'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { MonthlyPayment, CreatePaymentDto, PaymentMethod } from '@foody/types';
import { XMarkIcon, PencilSquareIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import PaymentMethodPicker from '@/components/payments/PaymentMethodPicker';
import { PAYMENT_METHOD_LABELS, maskLast4, methodNeedsBank } from '@/lib/payment-methods';
import { formatMonthLong, formatMonthShort } from '@/lib/payment-aggregates';
import { daysUntilNextDue, nextDueDate } from '@/lib/payment-cycle';

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

/** Background gradient per method for the little icon tile */
const METHOD_TILE_BG: Record<PaymentMethod, string> = {
  transfer: 'linear-gradient(135deg,#3B82F6,#2563EB)',
  debit_card: 'linear-gradient(135deg,#6366F1,#4F46E5)',
  credit_card: 'linear-gradient(135deg,#8B5CF6,#6D28D9)',
  bank_account: 'linear-gradient(135deg,#10B981,#059669)',
  cash: 'linear-gradient(135deg,#22C55E,#16A34A)',
  other: 'linear-gradient(135deg,#6B7280,#4B5563)',
};

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
      isVariableAmount: payment.isVariableAmount,
      isAutoPay: payment.isAutoPay,
      paymentMethod: payment.paymentMethod,
      bankName: payment.bankName,
      accountLast4: payment.accountLast4,
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

/** Short human date for the next due day, e.g. "15 may". */
function formatShortDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(d);
}

/** Pending-status pill label + classes, handling overdue / due-today / upcoming. */
function pendingStatus(days: number): { label: string; cls: string } {
  if (days < 0) {
    return { label: `⏰ Pendiente · Venció hace ${plural(Math.abs(days), 'día')}`, cls: 'bg-red-500/20 text-red-300' };
  }
  if (days === 0) {
    return { label: '⚡ Pendiente · Vence hoy', cls: 'bg-red-500/20 text-red-300' };
  }
  return { label: `⏰ Pendiente · En ${plural(days, 'día')}`, cls: 'bg-amber-500/20 text-amber-300' };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'view' | 'edit' | 'confirm-delete';
type InlineField = 'dueDay' | 'notify' | null;

interface HistoryRecord {
  id: string;
  month: number;
  year: number;
  paidAt: string | null;
  amount: number;
  actualAmount: number | null;
  paymentMethod: PaymentMethod | null;
  bankAccount: string | null;
  notes: string | null;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

  // Inline payment-method editor (view mode)
  const [editingMethod, setEditingMethod] = useState(false);
  const [methodDraft, setMethodDraft] = useState<PaymentMethod | null>(payment.paymentMethod);
  const [bankDraft, setBankDraft] = useState(payment.bankName ?? '');
  const [last4Draft, setLast4Draft] = useState(payment.accountLast4 ?? '');
  const [methodSaving, setMethodSaving] = useState(false);

  // Auto/manual mode toggle (view mode)
  const [modeSaving, setModeSaving] = useState(false);

  // History
  const [history, setHistory] = useState<HistoryRecord[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Inline record editor + add-record form (history section)
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);
  const [recAmount, setRecAmount] = useState('');
  const [recNotes, setRecNotes] = useState('');
  const [recDeleteArmed, setRecDeleteArmed] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMonthKey, setAddMonthKey] = useState('');
  const [addAmount, setAddAmount] = useState('');

  // Sync form when payment prop changes
  useEffect(() => {
    const { form: f, notifyValue: nv, notifyUnit: nu } = buildEditState(payment);
    setForm(f);
    setNotifyValue(nv);
    setNotifyUnit(nu);
    setInlineField(null);
    setEditingMethod(false);
    setExpandedRecId(null);
    setAddOpen(false);
    setRecError(null);
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

  // Lazy-load history when opened in view mode. Skips applying the response
  // right after a local record mutation: the serverless driver can serve a
  // stale read-after-write, which would clobber the locally-correct list.
  const lastRecordMutation = useRef(0);
  useEffect(() => {
    if (!open || mode !== 'view') return;
    setHistoryLoading(true);
    fetch(`/api/payments/${currentPayment.id}/records`, { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: HistoryRecord[]) => {
        if (Date.now() - lastRecordMutation.current > 3000) setHistory(data);
      })
      .catch(() => undefined)
      .finally(() => setHistoryLoading(false));
  }, [open, mode, currentPayment.id, isPaid]);

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
      if (!form.dueDay || form.dueDay < 1 || form.dueDay > 31) {
        setError('El día de vencimiento debe estar entre 1 y 31');
        return;
      }
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
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [form, notifyValue, notifyUnit, currentPayment.id, onUpdated],
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
        }
      } finally {
        setInlineSaving(false);
      }
    },
    [inlineDueDay, inlineNotifyValue, inlineNotifyUnit, currentPayment.id, onUpdated],
  );

  const saveAutoPay = useCallback(
    async (isAutoPay: boolean) => {
      if (isAutoPay === currentPayment.isAutoPay || modeSaving) return;
      setModeSaving(true);
      try {
        const res = await fetch(`/api/payments/${currentPayment.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isAutoPay }),
        });
        if (res.ok) {
          const updated = (await res.json()) as MonthlyPayment;
          setCurrentPayment(updated);
          onUpdated(updated);
        }
      } finally {
        setModeSaving(false);
      }
    },
    [currentPayment.id, currentPayment.isAutoPay, modeSaving, onUpdated],
  );

  /**
   * Apply a record mutation locally (no re-fetch: an immediate read-after-write
   * can return stale data on the serverless driver). Deltas are exact, so the
   * UI matches what the server will return on the next full load.
   */
  const paidOf = (r: HistoryRecord) => r.actualAmount ?? r.amount;

  function isCurrentMonth(month: number, year: number): boolean {
    const now = new Date();
    return month === now.getMonth() + 1 && year === now.getFullYear();
  }

  /** The month owes debt once its due date passed, starting from the payment's creation month. */
  function countsAsUnpaid(month: number, year: number): boolean {
    const created = new Date(currentPayment.createdAt);
    const createdKey = created.getFullYear() * 12 + created.getMonth() + 1;
    const recordKey = year * 12 + month;
    if (recordKey < createdKey) return false;
    if (isCurrentMonth(month, year)) return daysUntilNextDue(currentPayment.dueDay, false) < 0;
    const now = new Date();
    return recordKey < now.getFullYear() * 12 + now.getMonth() + 1;
  }

  function publishPayment(next: MonthlyPayment) {
    lastRecordMutation.current = Date.now();
    setCurrentPayment(next);
    onUpdated(next);
  }

  function applyRecordUpsert(record: HistoryRecord) {
    const prevList = history ?? [];
    const existing = prevList.find((r) => r.month === record.month && r.year === record.year);
    const nextList = [record, ...prevList.filter((r) => !(r.month === record.month && r.year === record.year))]
      .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));
    setHistory(nextList);

    const paidDelta = paidOf(record) - (existing ? paidOf(existing) : 0);
    const nowPaid = currentPayment.isPaidThisMonth || isCurrentMonth(record.month, record.year);
    const unpaid = (currentPayment.unpaidMonths ?? []).filter(
      (u) => !(u.month === record.month && u.year === record.year),
    );
    publishPayment({
      ...currentPayment,
      isPaidThisMonth: nowPaid,
      daysUntilDue: daysUntilNextDue(currentPayment.dueDay, nowPaid),
      nextDueDate: nextDueDate(currentPayment.dueDay, nowPaid).toISOString(),
      unpaidMonths: unpaid,
      missedMonths: unpaid.length,
      accumulatedDebt: unpaid.length * currentPayment.amount,
      totalPaidAllTime: Math.max(0, (currentPayment.totalPaidAllTime ?? 0) + paidDelta),
      paidCountAllTime: (currentPayment.paidCountAllTime ?? 0) + (existing ? 0 : 1),
      lastPaidAt: record.paidAt ?? currentPayment.lastPaidAt ?? null,
    });
  }

  function applyRecordDelete(record: HistoryRecord) {
    setHistory((prev) => (prev ?? []).filter((r) => r.id !== record.id));

    const wasCurrentMonth = isCurrentMonth(record.month, record.year);
    const nowPaid = wasCurrentMonth ? false : currentPayment.isPaidThisMonth;
    const unpaid = [...(currentPayment.unpaidMonths ?? [])];
    if (countsAsUnpaid(record.month, record.year) && !unpaid.some((u) => u.month === record.month && u.year === record.year)) {
      unpaid.push({ month: record.month, year: record.year });
      unpaid.sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
    }
    publishPayment({
      ...currentPayment,
      isPaidThisMonth: nowPaid,
      daysUntilDue: daysUntilNextDue(currentPayment.dueDay, nowPaid),
      nextDueDate: nextDueDate(currentPayment.dueDay, nowPaid).toISOString(),
      unpaidMonths: unpaid,
      missedMonths: unpaid.length,
      accumulatedDebt: unpaid.length * currentPayment.amount,
      totalPaidAllTime: Math.max(0, (currentPayment.totalPaidAllTime ?? 0) - paidOf(record)),
      paidCountAllTime: Math.max(0, (currentPayment.paidCountAllTime ?? 0) - 1),
    });
  }

  function openRecordEditor(rec: HistoryRecord) {
    if (expandedRecId === rec.id) { setExpandedRecId(null); return; }
    setExpandedRecId(rec.id);
    setRecAmount((rec.actualAmount ?? rec.amount).toFixed(2));
    setRecNotes(rec.notes ?? '');
    setRecDeleteArmed(false);
    setRecError(null);
    setAddOpen(false);
  }

  async function saveRecord(rec: HistoryRecord) {
    const parsed = Number.parseFloat(recAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setRecError('Ingresa un monto válido'); return; }
    setRecBusy(true);
    setRecError(null);
    try {
      const res = await fetch(`/api/payments/${currentPayment.id}/records/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: parsed, notes: recNotes }),
      });
      if (!res.ok) throw new Error('No se pudo guardar el cambio');
      applyRecordUpsert(await res.json() as HistoryRecord);
      setExpandedRecId(null);
    } catch (err) {
      setRecError((err as Error).message);
    } finally {
      setRecBusy(false);
    }
  }

  async function deleteRecord(rec: HistoryRecord) {
    // Two-tap confirm: the first tap arms the button, the second deletes.
    if (!recDeleteArmed) { setRecDeleteArmed(true); return; }
    setRecBusy(true);
    setRecError(null);
    try {
      const res = await fetch(`/api/payments/${currentPayment.id}/records/${rec.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('No se pudo eliminar el registro');
      applyRecordDelete(rec);
      setExpandedRecId(null);
    } catch (err) {
      setRecError((err as Error).message);
    } finally {
      setRecBusy(false);
    }
  }

  function openAddForm() {
    const now = new Date();
    const oldest = currentPayment.unpaidMonths?.[0] ?? { month: now.getMonth() + 1, year: now.getFullYear() };
    setAddMonthKey(`${oldest.year}-${oldest.month}`);
    setAddAmount(currentPayment.amount.toFixed(2));
    setRecError(null);
    setExpandedRecId(null);
    setAddOpen(true);
  }

  async function addRecord() {
    const [yearStr, monthStr] = addMonthKey.split('-');
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const parsed = Number.parseFloat(addAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setRecError('Ingresa un monto válido'); return; }
    setRecBusy(true);
    setRecError(null);
    try {
      const res = await fetch(`/api/payments/${currentPayment.id}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month, year, amount: parsed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? 'No se pudo registrar el pago');
      }
      applyRecordUpsert(await res.json() as HistoryRecord);
      setAddOpen(false);
    } catch (err) {
      setRecError((err as Error).message);
    } finally {
      setRecBusy(false);
    }
  }

  /** Last 24 months for the add-record select, newest first. */
  function buildMonthOptions(): Array<{ key: string; label: string; taken: boolean }> {
    const taken = new Set((history ?? []).map((r) => `${r.year}-${r.month}`));
    const out: Array<{ key: string; label: string; taken: boolean }> = [];
    const cursor = new Date();
    for (let i = 0; i < 24; i++) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const key = `${y}-${m}`;
      out.push({ key, label: formatMonthLong(m, y), taken: taken.has(key) });
      cursor.setMonth(cursor.getMonth() - 1);
    }
    return out;
  }

  const openMethodEditor = useCallback(() => {
    setMethodDraft(currentPayment.paymentMethod);
    setBankDraft(currentPayment.bankName ?? '');
    setLast4Draft(currentPayment.accountLast4 ?? '');
    setEditingMethod(true);
  }, [currentPayment.paymentMethod, currentPayment.bankName, currentPayment.accountLast4]);

  const saveMethod = useCallback(async () => {
    if (!methodDraft) return;
    setMethodSaving(true);
    const keepBank = methodNeedsBank(methodDraft);
    const patch: Partial<CreatePaymentDto> = {
      paymentMethod: methodDraft,
      bankName: keepBank ? bankDraft.trim() || null : null,
      accountLast4: keepBank ? last4Draft || null : null,
    };
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
        setEditingMethod(false);
      }
    } finally {
      setMethodSaving(false);
    }
  }, [methodDraft, bankDraft, last4Draft, currentPayment.id, onUpdated]);

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
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1 flex items-center gap-2">
            {currentPayment.isVariableAmount ? 'Monto estimado' : 'Monto mensual'}
            {currentPayment.isVariableAmount && (
              <span className="normal-case text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 tracking-normal">
                ⚡ Variable
              </span>
            )}
            {currentPayment.isAutoPay && (
              <span className="normal-case text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 tracking-normal">
                🤖 Auto
              </span>
            )}
          </p>
          <p className="text-white text-3xl font-extrabold">
            {currentPayment.isVariableAmount && <span className="text-gray-400 mr-1">≈</span>}
            {currentPayment.currency} {currentPayment.amount.toFixed(2)}
          </p>
          {currentPayment.isVariableAmount && (
            <p className="text-gray-500 text-[11px] mt-1">
              El monto real se captura al pagar (recibo de consumo)
            </p>
          )}
        </div>

        {/* Accumulated debt */}
        {!isPaid && (currentPayment.unpaidMonths?.length ?? 0) > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-red-300 text-xs font-semibold uppercase tracking-wide">🚨 Acumulado</p>
              <p className="text-red-300 text-lg font-extrabold">
                {currentPayment.currency} {((currentPayment.unpaidMonths?.length ?? 0) * currentPayment.amount).toFixed(2)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(currentPayment.unpaidMonths ?? []).map((u) => (
                <span
                  key={`${u.year}-${u.month}`}
                  className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-red-500/20 text-red-200"
                >
                  {formatMonthShort(u)}
                </span>
              ))}
            </div>
            <p className="text-red-400/80 text-[11px] mt-2">
              Cada pago que registres abona al mes más antiguo pendiente.
            </p>
          </div>
        )}

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

        {/* Payment mode: automatic vs manual */}
        <div className="bg-white/5 rounded-2xl p-3.5 mb-4">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Modo de pago</p>
          <div className="grid grid-cols-2 gap-1 bg-white/5 rounded-xl p-1" role="group" aria-label="Modo de pago">
            <button
              type="button"
              disabled={modeSaving}
              onClick={() => saveAutoPay(true)}
              aria-pressed={currentPayment.isAutoPay}
              className={`py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-60 ${
                currentPayment.isAutoPay
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-gray-400 hover:bg-white/10 active:bg-white/15'
              }`}
            >
              🤖 Automático
            </button>
            <button
              type="button"
              disabled={modeSaving}
              onClick={() => saveAutoPay(false)}
              aria-pressed={!currentPayment.isAutoPay}
              className={`py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-60 ${
                currentPayment.isAutoPay
                  ? 'text-gray-400 hover:bg-white/10 active:bg-white/15'
                  : 'bg-brand-500 text-white shadow-md'
              }`}
            >
              ✋ Manual
            </button>
          </div>
          <p className="text-gray-500 text-[11px] mt-2 leading-relaxed">
            {currentPayment.isAutoPay
              ? `Se cobra solo: la app lo marcará como pagado el día ${currentPayment.dueDay} y te avisará.`
              : 'Tú registras el pago cada mes con el botón "Marcar como pagado".'}
          </p>
        </div>

        {/* Payment method */}
        {renderMethodSection()}

        {/* Description */}
        {currentPayment.description && (
          <div className="bg-white/5 rounded-xl p-3 mb-4">
            <p className="text-gray-400 text-xs font-medium mb-1">Notas</p>
            <p className="text-white text-sm leading-relaxed">{currentPayment.description}</p>
          </div>
        )}

        {/* Status badge */}
        <div className="mb-5 flex flex-col items-start gap-2">
          {isPaid ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300">
                <CheckCircleIcon className="w-4 h-4" />
                Pagado este mes
              </span>
              {currentPayment.daysUntilDue > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 text-gray-300">
                  🔄 Próximo pago en {plural(currentPayment.daysUntilDue, 'día')}
                  {formatShortDate(currentPayment.nextDueDate) && (
                    <span className="text-gray-500"> · {formatShortDate(currentPayment.nextDueDate)}</span>
                  )}
                </span>
              )}
            </>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full ${pendingStatus(currentPayment.daysUntilDue).cls}`}>
              {pendingStatus(currentPayment.daysUntilDue).label}
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

        {/* History */}
        {renderHistory()}
      </>
    );
  }

  // ── Payment method (default) ─────────────────────────────────────────────
  function renderMethodSection() {
    if (!editingMethod) return renderMethodCard();
    return (
      <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl p-3.5 mb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-brand-300 text-xs font-semibold uppercase tracking-wide">Método de pago</p>
          {currentPayment.paymentMethod && (
            <button
              type="button"
              onClick={() => setEditingMethod(false)}
              aria-label="Cerrar edición de método"
              className="text-gray-400 hover:text-white transition"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <PaymentMethodPicker
          method={methodDraft}
          bankName={bankDraft}
          accountLast4={last4Draft}
          onMethodChange={setMethodDraft}
          onBankNameChange={setBankDraft}
          onAccountLast4Change={setLast4Draft}
          idPrefix="inline-method"
          variant="dark"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditingMethod(false)}
            className="flex-1 py-2.5 rounded-xl bg-white/10 text-gray-300 text-sm font-semibold hover:bg-white/20 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={methodSaving || !methodDraft}
            onClick={saveMethod}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-bold disabled:opacity-50 transition"
          >
            {methodSaving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    );
  }

  function renderMethodCard() {
    const method = currentPayment.paymentMethod;
    if (!method) {
      return (
        <button
          type="button"
          onClick={openMethodEditor}
          className="w-full mb-4 flex items-center gap-3 p-3.5 rounded-2xl border border-dashed border-white/20 bg-white/3 hover:bg-white/6 hover:border-brand-500/50 transition text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0" aria-hidden="true">💳</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">Agregar método de pago</p>
            <p className="text-gray-500 text-xs">Banco, tarjeta o efectivo</p>
          </div>
          <span className="text-brand-400 text-lg shrink-0 group-hover:translate-x-0.5 transition" aria-hidden="true">＋</span>
        </button>
      );
    }
    const info = PAYMENT_METHOD_LABELS[method];
    const masked = maskLast4(currentPayment.accountLast4);
    const hasDetail = Boolean(currentPayment.bankName) || Boolean(masked);
    return (
      <button
        type="button"
        onClick={openMethodEditor}
        className="w-full mb-4 flex items-center gap-3 p-3.5 rounded-2xl border border-white/10 bg-linear-to-br from-white/8 to-white/2 hover:border-brand-500/40 transition text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-inner"
          style={{ background: METHOD_TILE_BG[method] }}
          aria-hidden="true"
        >
          {info.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wide mb-0.5">Método de pago</p>
          <p className="text-white text-sm font-bold truncate">{info.label}</p>
          {hasDetail ? (
            <p className="text-gray-400 text-xs truncate">
              {currentPayment.bankName && <span>{currentPayment.bankName}</span>}
              {currentPayment.bankName && masked && <span className="text-gray-600"> · </span>}
              {masked && <span className="font-mono tracking-wider">{masked}</span>}
            </p>
          ) : (
            <p className="text-gray-500 text-xs">Toca para añadir banco o tarjeta</p>
          )}
        </div>
        <PencilSquareIcon className="w-4 h-4 text-gray-500 group-hover:text-brand-400 transition shrink-0" />
      </button>
    );
  }

  // ── History (recent payment records — touchable: edit / delete / add) ───
  function renderRecordEditor(rec: HistoryRecord) {
    return (
      <div className="px-3 pb-3 flex flex-col gap-2">
        {recError && (
          <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">{recError}</p>
        )}
        <div>
          <label htmlFor="rec-edit-amount" className="block text-[11px] font-semibold text-gray-400 mb-1">
            Monto pagado
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs select-none">
              {currentPayment.currency}
            </span>
            <input
              id="rec-edit-amount"
              type="number"
              min={0.01}
              step="0.01"
              value={recAmount}
              onChange={(e) => setRecAmount(e.target.value)}
              className="w-full pl-12 pr-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div>
          <label htmlFor="rec-edit-notes" className="block text-[11px] font-semibold text-gray-400 mb-1">
            Nota <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <input
            id="rec-edit-notes"
            type="text"
            value={recNotes}
            maxLength={500}
            onChange={(e) => setRecNotes(e.target.value)}
            placeholder="Ej: Folio 123456"
            className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-2 mt-0.5">
          <button
            type="button"
            disabled={recBusy}
            onClick={() => saveRecord(rec)}
            className="flex-1 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition disabled:opacity-50"
          >
            {recBusy ? 'Guardando…' : '💾 Guardar'}
          </button>
          <button
            type="button"
            disabled={recBusy}
            onClick={() => deleteRecord(rec)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-50 ${
              recDeleteArmed
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300'
            }`}
          >
            {recDeleteArmed ? '¿Seguro? Sí, eliminar' : '🗑 Eliminar'}
          </button>
        </div>
        {recDeleteArmed && (
          <p className="text-[10px] text-rose-400/80">
            Al eliminarlo, ese mes volverá a contar como pendiente y se restará del total pagado.
          </p>
        )}
      </div>
    );
  }

  function renderAddRecord() {
    if (!addOpen) {
      return (
        <button
          type="button"
          onClick={openAddForm}
          className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-white/20 text-gray-400 text-xs font-semibold hover:border-brand-500/50 hover:text-brand-300 active:bg-white/5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          ＋ Registrar pago de otro mes
        </button>
      );
    }
    return (
      <div className="mt-2 bg-brand-500/10 border border-brand-500/30 rounded-xl p-3 flex flex-col gap-2">
        <p className="text-brand-300 text-xs font-semibold">Registrar pago de un mes</p>
        {recError && (
          <p className="text-rose-300 text-xs bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">{recError}</p>
        )}
        <div>
          <label htmlFor="add-record-month" className="block text-[11px] font-semibold text-gray-400 mb-1">Mes</label>
          <select
            id="add-record-month"
            value={addMonthKey}
            onChange={(e) => setAddMonthKey(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {buildMonthOptions().map((o) => (
              <option key={o.key} value={o.key} className="bg-gray-900">
                {o.label}{o.taken ? ' · ya registrado' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-record-amount" className="block text-[11px] font-semibold text-gray-400 mb-1">Monto</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs select-none">
              {currentPayment.currency}
            </span>
            <input
              id="add-record-amount"
              type="number"
              min={0.01}
              step="0.01"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full pl-12 pr-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-0.5">
          <button
            type="button"
            onClick={() => { setAddOpen(false); setRecError(null); }}
            className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-semibold transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={recBusy}
            onClick={addRecord}
            className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition disabled:opacity-50"
          >
            {recBusy ? 'Guardando…' : '✓ Registrar'}
          </button>
        </div>
        <p className="text-[10px] text-gray-500">
          Si eliges un mes ya registrado, se actualizará ese registro.
        </p>
      </div>
    );
  }

  function renderHistory() {
    if (historyLoading && !history) {
      return (
        <div className="mt-6 pt-5 border-t border-white/10">
          <p className="text-gray-500 text-xs">Cargando historial…</p>
        </div>
      );
    }

    const records = history ?? [];
    const totalPaid = currentPayment.totalPaidAllTime ?? 0;
    const paidCount = currentPayment.paidCountAllTime ?? 0;
    return (
      <div className="mt-6 pt-5 border-t border-white/10">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">
            Historial reciente
          </p>
          {paidCount > 0 && (
            <p className="text-[11px] text-gray-400 text-right">
              Pagado a la fecha:{' '}
              <span className="text-emerald-300 font-bold">
                {currentPayment.currency} {totalPaid.toFixed(2)}
              </span>
              <span className="text-gray-500"> · {paidCount} {paidCount === 1 ? 'pago' : 'pagos'}</span>
            </p>
          )}
        </div>
        {records.length === 0 ? (
          <p className="text-gray-500 text-xs">Aún no hay pagos registrados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {records.slice(0, 6).map((rec) => {
              const methodInfo = rec.paymentMethod ? PAYMENT_METHOD_LABELS[rec.paymentMethod] : null;
              const monthLabel = `${MONTH_NAMES[rec.month - 1]} ${rec.year}`;
              const isExpanded = expandedRecId === rec.id;
              return (
                <li
                  key={rec.id}
                  className={`rounded-xl overflow-hidden transition ${
                    isExpanded ? 'bg-white/10 ring-1 ring-brand-500/40' : 'bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openRecordEditor(rec)}
                    aria-expanded={isExpanded}
                    className="w-full p-3 flex items-start gap-3 text-left hover:bg-white/5 active:bg-white/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-base shrink-0">
                      {methodInfo?.icon ?? '✓'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-white text-sm font-semibold">{monthLabel}</p>
                        <p className="text-white text-sm font-bold flex items-center gap-1.5">
                          {currentPayment.currency} {(rec.actualAmount ?? rec.amount).toFixed(2)}
                          <PencilSquareIcon className={`w-3.5 h-3.5 transition ${isExpanded ? 'text-brand-400' : 'text-gray-600 group-hover:text-gray-400'}`} />
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                        {methodInfo && <span>{methodInfo.label}</span>}
                        {rec.bankAccount && (
                          <>
                            {methodInfo && <span className="text-gray-600">·</span>}
                            <span className="truncate">{rec.bankAccount}</span>
                          </>
                        )}
                        {!methodInfo && !rec.bankAccount && (
                          <span className="text-gray-500">Toca para editar o eliminar</span>
                        )}
                      </div>
                      {rec.notes && !isExpanded && (
                        <p className="text-[11px] text-gray-500 mt-1 italic line-clamp-2">{rec.notes}</p>
                      )}
                    </div>
                  </button>
                  {isExpanded && renderRecordEditor(rec)}
                </li>
              );
            })}
          </ul>
        )}
        {renderAddRecord()}
      </div>
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
            {form.isVariableAmount ? 'Monto estimado' : 'Monto'} <span className="text-brand-400">*</span>
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

          {/* Variable toggle */}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, isVariableAmount: !f.isVariableAmount }))}
            aria-pressed={form.isVariableAmount}
            className={`mt-2 w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition ${
              form.isVariableAmount
                ? 'bg-amber-500/15 border-amber-500/40'
                : 'bg-white/5 border-white/10 hover:border-white/20'
            }`}
          >
            <div
              className={`mt-0.5 w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 transition ${
                form.isVariableAmount ? 'bg-amber-500 text-white' : 'bg-white/10 text-transparent border border-white/20'
              }`}
            >
              ✓
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">⚡ Monto variable (por consumo)</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Al pagar te pediremos el valor exacto del recibo.
              </p>
            </div>
          </button>

          {/* Auto-pay toggle */}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, isAutoPay: !f.isAutoPay }))}
            aria-pressed={form.isAutoPay}
            className={`mt-2 w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition ${
              form.isAutoPay
                ? 'bg-emerald-500/15 border-emerald-500/40'
                : 'bg-white/5 border-white/10 hover:border-white/20'
            }`}
          >
            <div
              className={`mt-0.5 w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 transition ${
                form.isAutoPay ? 'bg-emerald-500 text-white' : 'bg-white/10 text-transparent border border-white/20'
              }`}
            >
              ✓
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">🤖 Pago automatizado</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Se cobra automáticamente. La app lo marcará como pagado el día de vencimiento y te avisará.
              </p>
            </div>
          </button>
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
                inputMode="numeric"
                min={1}
                max={31}
                value={form.dueDay === 0 ? '' : form.dueDay}
                placeholder="Ej. 15"
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { setForm((f) => ({ ...f, dueDay: 0 })); return; }
                  const n = Number.parseInt(raw, 10);
                  if (Number.isNaN(n)) return;
                  setForm((f) => ({ ...f, dueDay: Math.min(31, Math.max(0, n)) }));
                }}
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

        {/* Método de pago */}
        <div>
          <span className="block text-xs font-semibold text-gray-400 mb-2">Método de pago habitual</span>
          <PaymentMethodPicker
            method={form.paymentMethod ?? null}
            bankName={form.bankName ?? ''}
            accountLast4={form.accountLast4 ?? ''}
            onMethodChange={(m) => setForm((f) => ({ ...f, paymentMethod: m }))}
            onBankNameChange={(v) => setForm((f) => ({ ...f, bankName: v }))}
            onAccountLast4Change={(v) => setForm((f) => ({ ...f, accountLast4: v }))}
            idPrefix="edit-method"
            variant="dark"
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
