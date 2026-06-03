'use client';

import { useState } from 'react';
import type { MonthlyPayment } from '@foody/types';
import { useToast } from '@/components/ui/Toast';

interface Props {
  readonly payments: readonly MonthlyPayment[];
  readonly onSnoozed: (id: string, snoozedUntil: string) => void;
}

type Busy = 'test' | 'trigger' | 'snooze' | 'resubscribe' | null;

interface ApiResp {
  readonly ok?: boolean;
  readonly sent?: boolean | number;
  readonly checked?: number;
  readonly expiredCleared?: number;
  readonly message?: string;
  readonly error?: string;
  readonly statusCode?: number;
  readonly gone?: boolean;
}

export default function NotificationsTestPanel({ payments, onSnoozed }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [needsResubscribe, setNeedsResubscribe] = useState(false);
  const toast = useToast();

  const activePending = payments.filter((p) => !p.isPaidThisMonth);

  async function handleTest() {
    setBusy('test');
    setNeedsResubscribe(false);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as ApiResp;
      if (res.ok && data.sent) {
        toast.show('✅ Notificación de prueba enviada', 'success');
      } else {
        const msg = data.error ?? data.message ?? `Error ${res.status}`;
        toast.show(msg, 'error');
        if (data.gone || res.status === 410) setNeedsResubscribe(true);
      }
    } catch (err) {
      toast.show((err as Error).message ?? 'Error de red', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleResubscribe() {
    setBusy('resubscribe');
    try {
      // Clear local "already-saved" flag so PushNotifications re-saves on next load
      try { localStorage.removeItem('foody_webpush_endpoint'); } catch { /* ignore */ }

      if (!('serviceWorker' in navigator) || !('PushManager' in globalThis)) {
        toast.show('Este navegador no soporta notificaciones push', 'error');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe().catch(() => undefined);
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.show('Falta VAPID public key en el cliente', 'error');
        return;
      }
      // Convert base64url to Uint8Array
      const pad = '='.repeat((4 - (vapidKey.length % 4)) % 4);
      const b64 = (vapidKey + pad).replaceAll('-', '+').replaceAll('_', '/');
      const raw = atob(b64);
      const buf = new ArrayBuffer(raw.length);
      const key = new Uint8Array(buf);
      for (let i = 0; i < raw.length; i++) key[i] = raw.codePointAt(i) ?? 0;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });

      const save = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pushSubscription: sub.toJSON() }),
      });
      if (!save.ok) {
        toast.show('No se pudo guardar la nueva suscripción', 'error');
        return;
      }
      try { localStorage.setItem('foody_webpush_endpoint', sub.endpoint); } catch { /* ignore */ }
      toast.show('✅ Re-suscrito. Prueba la notificación de nuevo.', 'success');
      setNeedsResubscribe(false);
    } catch (err) {
      toast.show(`No se pudo re-suscribir: ${(err as Error).message}`, 'error');
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

          {needsResubscribe && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 flex items-center justify-between gap-2">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Tu suscripción no es válida. Re-suscríbete para volver a recibir notificaciones.
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={handleResubscribe}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                {busy === 'resubscribe' ? '…' : '🔄 Re-suscribir'}
              </button>
            </div>
          )}

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
