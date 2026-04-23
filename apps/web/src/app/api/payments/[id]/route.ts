import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

async function getUserHousehold(userId: string): Promise<string | null> {
  const rows = await sql`SELECT household_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (rows[0] as { household_id: string | null } | undefined)?.household_id ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT * FROM payments WHERE id = ${id} LIMIT 1`;
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const householdId = await getUserHousehold(user.userId);
  const body = await request.json() as Record<string, unknown>;

  let rows;
  if (householdId) {
    rows = await sql`
      UPDATE payments SET
        name = COALESCE(${body.name as string ?? null}, name),
        amount = COALESCE(${body.amount as number ?? null}, amount),
        is_paid = COALESCE(${body.isPaid as boolean ?? null}, is_paid),
        due_date = COALESCE(${body.dueDate as string ?? null}, due_date),
        notes = COALESCE(${body.notes as string ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id} AND household_id = ${householdId} RETURNING *
    `;
  } else {
    rows = await sql`
      UPDATE payments SET
        name = COALESCE(${body.name as string ?? null}, name),
        amount = COALESCE(${body.amount as number ?? null}, amount),
        is_paid = COALESCE(${body.isPaid as boolean ?? null}, is_paid),
        due_date = COALESCE(${body.dueDate as string ?? null}, due_date),
        notes = COALESCE(${body.notes as string ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.userId} AND household_id IS NULL RETURNING *
    `;
  }
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const householdId = await getUserHousehold(user.userId);

  let rows;
  if (householdId) {
    rows = await sql`DELETE FROM payments WHERE id = ${id} AND household_id = ${householdId} RETURNING id`;
  } else {
    rows = await sql`DELETE FROM payments WHERE id = ${id} AND user_id = ${user.userId} AND household_id IS NULL RETURNING id`;
  }
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
