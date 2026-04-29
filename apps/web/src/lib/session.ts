import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionData } from '@foody/types';

export type { SessionData } from '@foody/types';

function getSessionPassword(): string {
  const password = process.env.IRON_SESSION_PASSWORD;
  if (password && password.length >= 32) return password;
  if (process.env.NODE_ENV === 'production' && process.env.E2E_TEST_MODE !== 'true') {
    throw new Error('IRON_SESSION_PASSWORD must be set to a 32+ char secret in production');
  }
  // Dev-only deterministic fallback (never reached in prod)
  return ['fallback', 'dev', 'password', 'must', 'be', 'at', 'least', '32ch']
    .join('-')
    .padEnd(32, 'x');
}

function buildSessionOptions(): SessionOptions {
  return {
    password: getSessionPassword(),
    cookieName: 'foody_session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

export function getSessionOptions(): SessionOptions {
  return buildSessionOptions();
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, buildSessionOptions());
}

export const defaultSession: SessionData = {
  jwt: '',
  userId: '',
  email: '',
  name: null,
  avatarUrl: null,
  isLoggedIn: false,
};
