import { NextRequest, NextResponse } from 'next/server';
import type { PushSubscription } from 'web-push';
import { rechazoCron } from '@/lib/cron-auth';
import { sql } from '@/lib/db';
import { ensureDebtSchema } from '@/lib/debt-data';
import { avisoDePromo, hitoDeAvisoPromo, mensajeAvisoPromo } from '@/lib/debt-promo';
import { sendWebPush } from '@/lib/web-push';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Fila = {
  id: string;
  user_id: string;
  name: string;
  currency: string | null;
  current_balance: string | number;
  promo_ends_on: string | Date;
  rate_after_promo: string | number;
  promo_kind: string | null;
  deferred_interest: string | number | null;
  opened_at: string | Date;
  push_subscription: PushSubscription;
};

/** Postgres devuelve los DATE como Date o como texto según el driver. */
function claveDeFecha(valor: string | Date): string {
  return (valor instanceof Date ? valor.toISOString() : String(valor)).slice(0, 10);
}

/**
 * GET /api/cron/debt-promo-alerts — avisa al móvil de los 0 % que se acaban.
 *
 * Una promoción al 0 % se olvida fácil: la fecha está en un PDF y el día
 * siguiente el saldo que quede empieza a cobrar la tasa normal. Se avisa a 60,
 * 30, 7 y 1 día del fin, y una vez después si quedó saldo, siempre con lo que
 * costaría al mes (debt-promo.ts).
 *
 * Cada aviso se apunta en `debt_promo_alerts` ANTES de mandarlo, así un cron
 * repetido no lo duplica; si el envío falla se borra, y sale al día siguiente.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoCron(request);
  if (rechazo) return rechazo;

  await ensureDebtSchema();
  // Día en UTC: el cron corre a las 14:00 UTC, que en América es la misma
  // fecha del calendario del usuario.
  const hoy = new Date().toISOString().slice(0, 10);

  const filas = (await sql`
    SELECT d.id, d.user_id, d.name, d.currency, d.current_balance, d.promo_ends_on,
           d.rate_after_promo, d.promo_kind, d.deferred_interest, d.opened_at, u.push_subscription
      FROM debts d
      JOIN users u ON u.id = d.user_id
     WHERE d.status = 'active'
       AND d.current_balance > 0
       AND d.promo_ends_on IS NOT NULL
       AND d.rate_after_promo IS NOT NULL
       AND u.push_subscription IS NOT NULL
  `) as Fila[];

  let enviados = 0;
  const sinSuscripcion: string[] = [];

  for (const f of filas) {
    const fin = claveDeFecha(f.promo_ends_on);
    const aviso = avisoDePromo(
      {
        currentBalance: Number(f.current_balance),
        promoEndsOn: fin,
        rateAfterPromo: Number(f.rate_after_promo),
        promoKind: f.promo_kind === 'diferido' ? 'diferido' : 'cero',
        deferredInterest: f.deferred_interest == null ? null : Number(f.deferred_interest),
        openedAt: claveDeFecha(f.opened_at),
      },
      hoy,
    );
    const hito = hitoDeAvisoPromo(aviso);
    if (!aviso || !hito) continue;

    const apuntado = await sql`
      INSERT INTO debt_promo_alerts (debt_id, promo_ends_on, hito)
      VALUES (${f.id}, ${fin}, ${hito})
      ON CONFLICT DO NOTHING
      RETURNING debt_id
    `;
    if (apuntado.length === 0) continue;

    const mensaje = mensajeAvisoPromo(f.name, aviso, f.currency ?? 'USD');
    const envio = await sendWebPush(f.push_subscription, { ...mensaje, url: '/debts' });
    if (envio.ok) {
      enviados++;
      continue;
    }
    await sql`DELETE FROM debt_promo_alerts WHERE debt_id = ${f.id} AND promo_ends_on = ${fin} AND hito = ${hito}`;
    if (envio.gone) sinSuscripcion.push(f.user_id);
  }

  if (sinSuscripcion.length) {
    await sql`UPDATE users SET push_subscription = NULL WHERE id = ANY(${sinSuscripcion}::uuid[])`;
  }

  return NextResponse.json({ revisadas: filas.length, enviados });
}
