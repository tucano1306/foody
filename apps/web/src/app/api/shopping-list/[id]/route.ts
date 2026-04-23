import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json() as { note?: string; checked?: boolean };

  const rows = await sql`
    UPDATE shopping_list_items SET
      note = COALESCE(${body.note ?? null}, note),
      checked = COALESCE(${body.checked ?? null}, checked)
    WHERE id = ${id} AND user_id = ${user.userId}
    RETURNING *
  `;
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const rows = await sql`DELETE FROM shopping_list_items WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
