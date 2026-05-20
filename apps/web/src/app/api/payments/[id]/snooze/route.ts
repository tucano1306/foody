import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

/** POST /api/payments/[id]/snooze — postpone notifications 3 days */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await getRouteUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const snoozedUntil = new Date(Date.now() + 3 * 86_400_000).toISOString();
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
