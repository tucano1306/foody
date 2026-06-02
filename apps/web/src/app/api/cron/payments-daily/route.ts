import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendWebPush } from '@/lib/web-push';
import type { PushSubscription } from 'web-push';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PaymentRow = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  due_day: number;
  notification_days_before: number;
  snoozed_until: string | null;
  user_id: string;
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

type Outcome = 'sent' | 'skipped' | 'gone' | 'fail';

async function processRow(row: PaymentRow, now: Date, today: number, daysInMonth: number): Promise<Outcome> {
  if (row.snoozed_until && new Date(row.snoozed_until) > now) return 'skipped';
  const days = daysUntilDue(row.due_day, today, daysInMonth);
  if (days > row.notification_days_before || days < 0) return 'skipped';
  if (!row.push_subscription) return 'skipped';

  const result = await sendWebPush(row.push_subscription, {
    title: '💳 Foody — Recordatorio de pago',
    body: buildBody(row.name, days, row.currency, row.amount),
    url: '/payments',
    data: { type: 'payment_reminder', paymentId: row.id, daysUntilDue: days },
  });
  if (result.ok) return 'sent';
  if (result.gone) return 'gone';
  return 'fail';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const rows = await sql`
    SELECT mp.id, mp.name, mp.amount, mp.currency, mp.due_day,
           mp.notification_days_before, mp.snoozed_until,
           mp.user_id, u.push_subscription
    FROM monthly_payments mp
    JOIN users u ON u.id = mp.user_id
    WHERE mp.is_active = true
  ` as PaymentRow[];

  let sent = 0;
  let skipped = 0;
  const goneUserIds: string[] = [];

  for (const row of rows) {
    const outcome = await processRow(row, now, today, daysInMonth);
    if (outcome === 'sent') sent++;
    else if (outcome === 'gone') goneUserIds.push(row.user_id);
    else if (outcome === 'skipped') skipped++;
  }

  if (goneUserIds.length) {
    await sql`UPDATE users SET push_subscription = NULL WHERE id = ANY(${goneUserIds}::uuid[])`;
  }

  return NextResponse.json({ checked: rows.length, sent, skipped });
}
