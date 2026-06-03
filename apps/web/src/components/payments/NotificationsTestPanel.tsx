'use client';

import { useState } from 'react';
import type { MonthlyPayment } from '@foody/types';
import { useToast } from '@/components/ui/Toast';

interface Props {
  readonly payments: readonly MonthlyPayment[];
  readonly onSnoozed: (id: string, snoozedUntil: string) => void;
}

type Busy = 'test' | 'trigger' | 'snooze' | null;

interface ApiResp {
  readonly ok?: boolean;
  readonly sent?: boolean | number;
  readonly checked?: number;
  readonly expiredCleared?: number;
  readonly message?: string;
  readonly error?: string;
}

export default function NotificationsTestPanel({ payments, onSnoozed }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const toast = useToast();

  const activePending = payments.filter((p) => !p.isPaidThisMonth);

  async function handleTest() {
    setBusy('test');
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResp;
      if (res.ok && data.sent) {
        toast.show('✅ Notificación de prueba enviada', 'success');
      } else {
        toast.show(data.error ?? data.message ?? 'No se pudo enviar', 'error');
      }
    } catch {
      toast.show('Error de red al enviar la prueba', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleTrigger() {
    setBusy('trigger');
    try {
      const res = await fetch('/api/notifications/trigger', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResp;
      if (res.ok && data.ok) {
        const n = typeof data.sent === 'number' ? data.sent : 0;
        if (n > 0) {
          toast.show(`✅ Se enviaron ${n} notificación(es)`, 'success');
          // Clear snooze in local state for expired ones — easiest: emit empty to refresh
          if (data.expiredCleared && data.expiredCleared > 0) {
            // Caller will refresh via revisits; for now just signal a refresh by snoozing
            // those that were cleared. Skipped — server already cleared them.
          }
        } else {
          toast.show(data.message ?? 'Ningún pago dentro de la ventana', 'info');
        }
      } else {
        toast.show(data.message ?? data.error ?? 'No se pudo disparar', 'error');
      }
    } catch {
      toast.show('Error de red', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleSnoozeAll5Min() {
    if (activePending.length === 0) {
      toast.show('No hay pagos pendientes para posponer', 'info');
      return;
    }
    setBusy('snooze');
    let snoozedCount = 0;
    try {
      for (const p of activePending) {
        const res = await fetch(`/api/payments/${p.id}/snooze?minutes=5`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { snoozedUntil?: string };
          if (body.snoozedUntil) {
            onSnoozed(p.id, body.snoozedUntil);
            snoozedCount++;
          }
        }
      }
      if (snoozedCount > 0) {
        toast.show(`⏰ ${snoozedCount} pago(s) pospuestos 5 min`, 'success');
      } else {
        toast.show('No se pudo posponer ningún pago', 'error');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-stone-50 dark:hover:bg-stone-800/50 transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🧪</span>
          <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">
            Probar notificaciones
          </span>
        </div>
        <span className={`text-stone-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 space-y-3 border-t border-stone-100 dark:border-stone-800">
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            Los recordatorios automáticos se envían a las 9:00 UTC. Usa estos botones para probarlos sin esperar.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={handleTest}
              className="px-3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition active:scale-95 disabled:opacity-50"
            >
              {busy === 'test' ? '…' : '🔔 Push de prueba'}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={handleTrigger}
              className="px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition active:scale-95 disabled:opacity-50"
            >
              {busy === 'trigger' ? '…' : '⚡ Disparar recordatorios'}
            </button>

            <button
              type="button"
              disabled={busy !== null || activePending.length === 0}
              onClick={handleSnoozeAll5Min}
              className="px-3 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
            >
              {busy === 'snooze' ? '…' : `⏰ Posponer 5 min (${activePending.length})`}
            </button>
          </div>

          <details className="text-[11px] text-stone-500 dark:text-stone-400">
            <summary className="cursor-pointer hover:text-stone-700 dark:hover:text-stone-300">
              ¿Cómo funciona cada botón?
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              <li><strong>Push de prueba:</strong> envía una notificación al instante a este dispositivo.</li>
              <li><strong>Disparar recordatorios:</strong> ejecuta la lógica del cron solo para ti. Notifica pagos dentro de la ventana o pospuestos que ya vencieron.</li>
              <li><strong>Posponer 5 min:</strong> snoozea todos los pendientes 5 minutos. Luego toca &quot;Disparar recordatorios&quot; para verlos llegar.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
