import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, badRequest, notFound } from '@/lib/route-helpers';

const MAX_NAME_LENGTH = 60;

interface MemberContext {
  readonly householdId: string;
  readonly ownerId: string;
  readonly member: { id: string; name: string | null; email: string; avatar_url: string | null };
}

/**
 * Resolves a member of *my* household. Returns null when I have no household or
 * the target user is not part of it, so callers answer 404 without leaking
 * whether that user exists at all.
 */
async function findMember(targetId: string, userId: string): Promise<MemberContext | null> {
  const rows = await sql`
    SELECT h.id AS household_id, h.owner_id, u.id, u.name, u.email, u.avatar_url
    FROM users me
    JOIN households h ON h.id = me.household_id
    JOIN users u ON u.household_id = h.id
    WHERE me.id = ${userId} AND u.id = ${targetId}
    LIMIT 1
  `;
  const row = rows[0] as (MemberContext['member'] & { household_id: string; owner_id: string }) | undefined;
  if (!row) return null;
  return {
    householdId: String(row.household_id),
    ownerId: String(row.owner_id),
    member: { id: String(row.id), name: row.name, email: row.email, avatar_url: row.avatar_url },
  };
}

// PATCH /api/households/members/[id] — rename a member of my household
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const ctx = await findMember(id, user.userId);
  if (!ctx) return notFound('Ese miembro no está en tu hogar');

  // I can always rename myself; renaming somebody else is the owner's call.
  const isOwner = ctx.ownerId === user.userId;
  if (!isOwner && id !== user.userId) {
    return NextResponse.json(
      { message: 'Solo el dueño del hogar puede editar a otros miembros' },
      { status: 403 },
    );
  }

  const body = await request.json() as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return badRequest('El nombre no puede estar vacío');
  if (name.length > MAX_NAME_LENGTH) return badRequest(`El nombre no puede pasar de ${MAX_NAME_LENGTH} caracteres`);

  const rows = await sql`
    UPDATE users SET name = ${name}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, email, avatar_url
  `;
  const updated = rows[0] as { id: string; name: string | null; email: string; avatar_url: string | null };
  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    avatarUrl: updated.avatar_url,
  });
}

// DELETE /api/households/members/[id] — remove a member from my household
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  const { id } = await params;

  const ctx = await findMember(id, user.userId);
  if (!ctx) return notFound('Ese miembro no está en tu hogar');

  if (ctx.ownerId !== user.userId) {
    return NextResponse.json(
      { message: 'Solo el dueño del hogar puede sacar a un miembro' },
      { status: 403 },
    );
  }
  // The owner cannot remove themselves this way — that would leave the household
  // without an owner. "Disolver hogar" (DELETE /households/leave) is that path.
  if (id === user.userId) {
    return badRequest('Eres el dueño: usa «Disolver hogar» para cerrarlo');
  }

  await sql`UPDATE users SET household_id = NULL, updated_at = now() WHERE id = ${id}`;
  // Same cleanup as leaving voluntarily: their products stop being shared with
  // this household instead of lingering in its namespace.
  await sql`
    UPDATE products SET household_id = NULL, updated_at = now()
    WHERE user_id = ${id} AND household_id = ${ctx.householdId}
  `;

  return new NextResponse(null, { status: 204 });
}
