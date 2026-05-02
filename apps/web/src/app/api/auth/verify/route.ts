import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '@/lib/session';
import { emailToUuid, signJWT } from '@/lib/server-auth';
import {
  getOtpMaxAttempts,
  isOtpExpired,
  normalizeCallbackUrl,
  verifyLoginCode,
} from '@/lib/login-otp';
import { sql } from '@/lib/db';
import type { SessionData } from '@foody/types';

function buildVerifyRedirect(request: NextRequest, search: Record<string, string | null | undefined>): URL {
  const url = new URL('/login/verify', request.url);
  for (const [key, value] of Object.entries(search)) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

export async function POST(request: NextRequest) {
  let email: string | undefined;
  let code: string | undefined;
  let callbackUrlInput: string | null | undefined;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
      callbackUrl?: string;
    };
    email = body.email;
    code = body.code;
    callbackUrlInput = body.callbackUrl;
  } else {
    const form = await request.formData();
    const emailValue = form.get('email');
    const codeValue = form.get('code');
    const callbackValue = form.get('callbackUrl');
    email = typeof emailValue === 'string' ? emailValue : undefined;
    code = typeof codeValue === 'string' ? codeValue : undefined;
    callbackUrlInput = typeof callbackValue === 'string' ? callbackValue : undefined;
  }

  email = email?.trim().toLowerCase();
  code = code?.trim();
  const callbackUrl = normalizeCallbackUrl(callbackUrlInput);

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  const pendingLogin = session.pendingLogin;

  if (!pendingLogin || !email || pendingLogin.email !== email) {
    return NextResponse.redirect(new URL('/login?error=session_expired', request.url), { status: 303 });
  }

  if (isOtpExpired(pendingLogin.expiresAt) || pendingLogin.attempts >= getOtpMaxAttempts()) {
    session.pendingLogin = undefined;
    await session.save();
    const expiredUrl = new URL('/login', request.url);
    expiredUrl.searchParams.set('error', 'code_expired');
    expiredUrl.searchParams.set('callbackUrl', pendingLogin.callbackUrl);
    return NextResponse.redirect(expiredUrl, { status: 303 });
  }

  if (!code || !/^\d{6}$/.test(code) || !verifyLoginCode(email, code, pendingLogin.codeHash)) {
    session.pendingLogin = {
      ...pendingLogin,
      attempts: pendingLogin.attempts + 1,
    };
    await session.save();
    return NextResponse.redirect(buildVerifyRedirect(request, {
      email,
      callbackUrl,
      error: 'invalid_code',
    }), { status: 303 });
  }

  const userId = emailToUuid(email);
  await sql`
    INSERT INTO users (id, email, name, avatar_url, created_at, updated_at)
    VALUES (${userId}, ${email}, ${pendingLogin.name}, null, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, users.name),
      updated_at = NOW()
  `;

  const jwt = await signJWT({
    sub: userId,
    email,
    name: pendingLogin.name,
    avatarUrl: null,
  });

  const redirectResponse = NextResponse.redirect(new URL(pendingLogin.callbackUrl, request.url), { status: 303 });
  const authSession = await getIronSession<SessionData>(request, redirectResponse, getSessionOptions());
  authSession.jwt = jwt;
  authSession.userId = userId;
  authSession.email = email;
  authSession.name = pendingLogin.name;
  authSession.avatarUrl = null;
  authSession.isLoggedIn = true;
  authSession.pendingLogin = undefined;
  await authSession.save();

  return redirectResponse;
}