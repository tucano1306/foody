import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { randomBytes } from 'node:crypto';

function generateCode(): string {
  // 6 uppercase alphanumeric characters (A-Z, 0-9), avoiding ambiguous chars O/0/I/1
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(6))
    .map((b) => chars[b % chars.length])
    .join('');
}

// POST /api/households/invites — generate invite code
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  const userRows = await sql`SELECT household_id FROM users WHERE id = ${user.userId} LIMIT 1`;
  const householdId = (userRows[0] as { household_id: string | null } | undefined)?.household_id;

  if (!householdId) {
    return NextResponse.json({ message: 'No perteneces a ningún hogar' }, { status: 400 });
  }

  // Expire in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const code = generateCode();

  await sql`
    INSERT INTO household_invites (code, household_id, created_by, expires_at)
    VALUES (${code}, ${householdId}, ${user.userId}, ${expiresAt})
  `;

  return NextResponse.json({ code }, { status: 201 });
}
