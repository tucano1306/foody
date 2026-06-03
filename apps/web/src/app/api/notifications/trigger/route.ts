import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendWebPush } from '@/lib/web-push';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import type { PushSubscription } from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 30;

type PaymentRow = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  due_day: number;
  notification_days_before: number;
  snoozed_until: string | null;
  push_subscription: PushSubscription | null;
};

function daysUntilDue(dueDay: number, today: number, daysInMonth: number): number {
  if (dueDay >= today) return dueDay - today;
  return daysInMonth - today + dueDay;
}

function buildBody(name: string, days: number, currency: string, amount: string): string {
  if (days === 0) return `¡${name} vence HOY! Monto: ${currency} ${amount}`;
  const plural = days > 1 ? 's' : '';
  return `${name} vence en ${days} día${plural}. Monto: ${currency} ${amount}`;
}

/**
 * POST /api/notifications/trigger
 * Runs the same logic as the daily/reminder crons but only for the current
 * user, on-demand. Useful for testing without waiting for the 9 AM UTC cron.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const rows = await sql`
    SELECT mp.id, mp.name, mp.amount, mp.currency, mp.due_day,
           mp.notification_days_before, mp.snoozed_until,
           u.push_subscription
    FROM monthly_payments mp
    JOIN users u ON u.id = mp.user_id
    WHERE mp.is_active = true AND mp.user_id = ${user.userId}
  ` as PaymentRow[];

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      checked: 0,
      sent: 0,
      message: 'No tienes pagos activos.',
    });
  }

  const subscription = rows[0].push_subscription;
  if (!subscription) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'no_subscription',
        message: 'No tienes notificaciones activadas en este dispositivo.',
      },
      { status: 400 },
    );
  }

  let sent = 0;
  let skipped = 0;
  let expiredCleared = 0;
  const expiredIds: string[] = [];

  for (const row of rows) {
    const snoozeDate = row.snoozed_until ? new Date(row.snoozed_until) : null;
    const snoozeActive = snoozeDate !== null && snoozeDate > now;
    const snoozeExpired = snoozeDate !== null && snoozeDate <= now;
    const days = daysUntilDue(row.due_day, today, daysInMonth);
    const withinWindow = days >= 0 && days <= row.notification_days_before;

    // Case 1: snooze expired → "el recordatorio pospuesto ya venció" + clear snooze
    if (snoozeExpired) {
      const r = await sendWebPush(subscription, {
        title: '💳 Pago pendiente',
        body: `El recordatorio de "${row.name}" que pospusiste ya venció. ¡No olvides pagarlo!`,
        url: '/payments',
      });
      if (r.ok) {
        sent++;
        expiredIds.push(row.id);
      }
      continue;
    }

    // Case 2: due within window and not snoozed → normal reminder
    if (!snoozeActive && withinWindow) {
      const r = await sendWebPush(subscription, {
        title: '💳 Foody — Recordatorio de pago',
        body: buildBody(row.name, days, row.currency, row.amount),
        url: '/payments',
        data: { type: 'payment_reminder', paymentId: row.id, daysUntilDue: days },
      });
      if (r.ok) sent++;
      continue;
    }

    skipped++;
  }

  if (expiredIds.length > 0) {
    await sql`
      UPDATE monthly_payments
      SET snoozed_until = NULL, updated_at = NOW()
      WHERE id = ANY(${expiredIds}::uuid[])
    `;
    expiredCleared = expiredIds.length;
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    sent,
    skipped,
    expiredCleared,
    message: sent === 0
      ? 'Ningún pago está dentro de la ventana de notificación (ni hay pospuestos vencidos).'
      : `Se enviaron ${sent} notificación(es).`,
  });
}
