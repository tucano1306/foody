import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized, badRequest } from '@/lib/route-helpers';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';

/**
 * GET /api/sharing/pantry
 * Returns all pantry share relationships involving the current user:
 *   sent   — invites the user created (as owner)
 *   received — invites directed at the user (as guest)
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const [sent, received] = await Promise.all([
    sql`
      SELECT ps.*, u.name AS guest_name, u.email AS guest_email, u.avatar_url AS guest_avatar
      FROM pantry_shares ps
      JOIN users u ON u.id = ps.guest_id
      WHERE ps.owner_id = ${user.userId}
      ORDER BY ps.created_at DESC
    `,
    sql`
      SELECT ps.*, u.name AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar
      FROM pantry_shares ps
      JOIN users u ON u.id = ps.owner_id
      WHERE ps.guest_id = ${user.userId}
      ORDER BY ps.created_at DESC
    `,
  ]);

  return NextResponse.json({ sent, received });
}

/**
 * POST /api/sharing/pantry
 * Body: { email: string; message?: string }
 * Sends a pantry-share invitation to the user identified by email.
 */
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const body = await request.json() as { email?: unknown; message?: unknown };
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return badRequest('email is required');

  // Resolve target user
  const targets = await sql`SELECT id, name, email FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
  if (!targets.length) return NextResponse.json({ message: `No existe un usuario con el email "${email}"` }, { status: 404 });
  const target = targets[0] as { id: string; name: string; email: string };

  if (target.id === user.userId) return badRequest('No puedes compartir contigo mismo');

  // Check for existing non-revoked/non-rejected share in either direction
  const existing = await sql`
    SELECT id, status FROM pantry_shares
    WHERE (owner_id = ${user.userId} AND guest_id = ${target.id})
       OR (owner_id = ${target.id} AND guest_id = ${user.userId})
    LIMIT 1
  `;
  if (existing.length) {
    const row = existing[0] as { id: string; status: string };
    if (row.status === 'accepted') return badRequest('Ya tienes acceso a la despensa de ese usuario o viceversa');
    if (row.status === 'pending') return badRequest('Ya existe una solicitud pendiente');
  }

  const rows = await sql`
    INSERT INTO pantry_shares (owner_id, guest_id, message)
    VALUES (${user.userId}, ${target.id}, ${typeof body.message === 'string' ? body.message.trim() || null : null})
    ON CONFLICT ON CONSTRAINT pantry_shares_pair DO UPDATE
      SET status = 'pending', message = EXCLUDED.message, updated_at = now(), responded_at = NULL
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
