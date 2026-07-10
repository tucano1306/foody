import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, notFound, unauthorized } from '@/lib/route-helpers';
import { mapRecord } from '@/lib/payment-records';

type Params = { params: Promise<{ id: string; recordId: string }> };

/** Edit the real paid amount and/or the note of a payment record. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id, recordId } = await params;

  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { body = {}; }

  let newAmount: number | null = null;
  if (body.amount !== undefined) {
    const parsed = typeof body.amount === 'number' ? body.amount : Number.parseFloat(String(body.amount));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ message: 'amount must be a positive number' }, { status: 422 });
    }
    newAmount = parsed;
  }
  const notesProvided = body.notes !== undefined;
  const newNotes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null;

  const rows = await sql`
    UPDATE payment_records SET
      actual_amount = COALESCE(${newAmount}, actual_amount),
      notes = CASE WHEN ${notesProvided} THEN ${newNotes} ELSE notes END
    WHERE id = ${recordId} AND payment_id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (!rows.length) return notFound();
  return NextResponse.json(mapRecord(rows[0] as Record<string, unknown>));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id, recordId } = await params;

  const rows = await sql`
    DELETE FROM payment_records
    WHERE id = ${recordId} AND payment_id = ${id} AND user_id = ${user.userId}
    RETURNING id
  `;
  if (!rows.length) return notFound();
  return NextResponse.json({ removed: true });
}
