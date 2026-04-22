import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions, defaultSession } from '@/lib/session';
import type { SessionData } from '@foody/types';

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  Object.assign(session, defaultSession);
  session.isLoggedIn = false;
  await session.save();
  return response;
}
