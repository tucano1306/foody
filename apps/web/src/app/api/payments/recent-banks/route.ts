import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

export async function GET(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  // Pull distinct bank names from the last 50 records of this user, most recent first.
  const rows = await sql`
    SELECT DISTINCT ON (bank_account) bank_account, MAX(created_at) AS last_used
    FROM payment_records
    WHERE user_id = ${user.userId} AND bank_account IS NOT NULL AND bank_account <> ''
    GROUP BY bank_account
    ORDER BY bank_account, last_used DESC
    LIMIT 50
  `;

  // Extract bank name (text before "•••" or the whole string)
  const banks = new Map<string, string>();
  for (const r of rows) {
    const full = String(r.bank_account ?? '').trim();
    if (!full) continue;
    const dotIdx = full.indexOf('•••');
    const name = (dotIdx >= 0 ? full.slice(0, dotIdx) : full).trim();
    if (name) banks.set(name.toLowerCase(), name);
  }

  return NextResponse.json([...banks.values()].slice(0, 8));
}
