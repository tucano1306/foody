import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';
import { ensureSharingSchema } from '@/lib/ensure-sharing-schema';

/**
 * GET /api/sharing/pending-count
 * Returns the total number of pending actions for the current user:
 *   - pantry share invites received (status = 'pending')
 *   - product gifts received (status = 'pending')
 * Used to drive the nav badge.
 */
export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();
  await ensureSharingSchema();

  const [pantryRow, giftsRow] = await Promise.all([
    sql`SELECT COUNT(*) AS n FROM pantry_shares WHERE guest_id = ${user.userId} AND status = 'pending'`,
    sql`SELECT COUNT(*) AS n FROM product_gifts WHERE recipient_id = ${user.userId} AND status = 'pending'`,
  ]);

  const total =
    Number((pantryRow[0] as { n: string }).n) +
    Number((giftsRow[0] as { n: string }).n);

  return NextResponse.json({ count: total });
}
