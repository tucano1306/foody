import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

/** POST /api/payments/[id]/snooze — postpone notifications.
 * Default: 3 days. Override with `?minutes=5` or body `{ minutes: N }`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await getRouteUser(request);
    if (!user) return unauthorized();

    const { id } = await params;

    // Read minutes override from query (?minutes=5) or JSON body { minutes: 5 }
    let minutes: number | null = null;
    const qp = request.nextUrl.searchParams.get('minutes');
    if (qp) {
      const n = Number.parseInt(qp, 10);
      if (Number.isFinite(n) && n > 0 && n <= 60 * 24 * 30) minutes = n;
    }
    if (minutes === null) {
      const body = await request.json().catch(() => null) as { minutes?: number } | null;
      if (body && typeof body.minutes === 'number' && body.minutes > 0 && body.minutes <= 60 * 24 * 30) {
        minutes = body.minutes;
      }
    }

    const ms = minutes === null ? 3 * 86_400_000 : minutes * 60_000;
    const snoozedUntil = new Date(Date.now() + ms).toISOString();
    const rows = await sql`
      UPDATE monthly_payments
         SET snoozed_until = ${snoozedUntil}::timestamptz,
             updated_at    = NOW()
       WHERE id = ${id} AND user_id = ${user.userId}
       RETURNING id
    `;
    if (!rows.length) return notFound();
    return NextResponse.json({ snoozedUntil });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[snooze] error:', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}

/** DELETE /api/payments/[id]/snooze — clear snooze */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  await sql`
    UPDATE monthly_payments
       SET snoozed_until = NULL,
           updated_at    = NOW()
     WHERE id = ${id} AND user_id = ${user.userId}
  `;
  return new NextResponse(null, { status: 204 });
}
