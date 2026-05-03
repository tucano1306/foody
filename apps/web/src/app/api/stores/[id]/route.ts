import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound } from '@/lib/route-helpers';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const rows = await sql`SELECT * FROM stores WHERE id = ${id} AND user_id = ${user.userId} LIMIT 1`;
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await request.json() as Record<string, unknown>;

  // Per-user isolation
  const rows = await sql`
    UPDATE stores SET
      name = COALESCE(${body.name as string ?? null}, name),
      address = COALESCE(${body.address as string ?? null}, address),
      updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.userId} RETURNING *
  `;
  if (!rows.length) return notFound();
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  // Per-user isolation
  const rows = await sql`DELETE FROM stores WHERE id = ${id} AND user_id = ${user.userId} RETURNING id`;
  if (!rows.length) return notFound();
  return new NextResponse(null, { status: 204 });
}
