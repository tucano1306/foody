/**
 * TEST-ONLY endpoint — creates a valid iron-session cookie for Playwright e2e tests.
 * Guarded: returns 403 in production. Never ships active in prod.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '@/lib/session';
import type { SessionData } from '@foody/types';

/** Stable deterministic user id used across all e2e tests */
export const TEST_USER_ID = '00000000-test-user-0000-000000000001';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true, userId: TEST_USER_ID });
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());

  session.isLoggedIn = true;
  session.userId = TEST_USER_ID;
  session.email = 'e2e@foody.dev';
  session.name = 'E2E Test User';
  session.jwt = 'e2e-mock-jwt';
  session.avatarUrl = null;
  await session.save();

  return response;
}
