import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, notFound, badRequest } from '@/lib/route-helpers';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/sharing/pantry/[id]
 * Body: { action: 'accept' | 'reject' | 'revoke' }
 *
 * - accept / reject  → only the GUEST can do this (pending → accepted/rejected)
 * - revoke           → only the OWNER can do this (accepted|pending → revoked)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const { id } = await params;
  const body = await request.json() as { action?: unknown };
  const action = body.action as string | undefined;

  if (!['accept', 'reject', 'revoke'].includes(action ?? '')) {
    return badRequest('action must be accept, reject, or revoke');
  }

  const rows = await sql`
    SELECT * FROM pantry_shares WHERE id = ${id} LIMIT 1
  `;
  if (!rows.length) return notFound('Solicitud no encontrada');
  const share = rows[0] as { id: string; owner_id: string; guest_id: string; status: string };

  if (action === 'revoke') {
    if (share.owner_id !== user.userId) return badRequest('Solo el dueño puede revocar');
    await sql`
      UPDATE pantry_shares SET status = 'revoked', updated_at = now()
      WHERE id = ${id}
    `;
  } else {
    // accept / reject — only the guest
    if (share.guest_id !== user.userId) return badRequest('Solo el invitado puede aceptar o rechazar');
    if (share.status !== 'pending') return badRequest('La solicitud ya fue respondida');
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await sql`
      UPDATE pantry_shares SET status = ${newStatus}, responded_at = now(), updated_at = now()
      WHERE id = ${id}
    `;
  }

  const updated = await sql`SELECT * FROM pantry_shares WHERE id = ${id} LIMIT 1`;
  return NextResponse.json(updated[0]);
}
