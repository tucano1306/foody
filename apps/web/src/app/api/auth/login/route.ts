import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '@/lib/session';
import {
  generateLoginCode,
  getOtpExpiryIso,
  hashLoginCode,
  normalizeCallbackUrl,
  sendLoginCodeEmail,
} from '@/lib/login-otp';
import type { SessionData } from '@foody/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let email: string | undefined;
  let name: string | null = null;
  let callbackUrl = '/home';

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      callbackUrl?: string;
    };
    email = body.email;
    name = body.name?.trim() || null;
    if (body.callbackUrl) callbackUrl = body.callbackUrl;
  } else {
    const form = await request.formData();
    const emailValue = form.get('email');
    const nameValue = form.get('name');
    const cbValue = form.get('callbackUrl');
    email = typeof emailValue === 'string' ? emailValue : undefined;
    name = typeof nameValue === 'string' && nameValue.trim() ? nameValue.trim() : null;
    if (typeof cbValue === 'string' && cbValue) callbackUrl = cbValue;
  }

  email = email?.trim().toLowerCase();
  callbackUrl = normalizeCallbackUrl(callbackUrl);

  if (!email || !EMAIL_RE.test(email)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'invalid_email');
    return NextResponse.redirect(url, { status: 303 });
  }

  const code = generateLoginCode();
  let emailResult: { debugCode?: string };

  try {
    emailResult = await sendLoginCodeEmail({ email, code });
  } catch {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'email_delivery_failed');
    url.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(url, { status: 303 });
  }

  const verifyUrl = new URL('/login/verify', request.url);
  verifyUrl.searchParams.set('email', email);
  verifyUrl.searchParams.set('callbackUrl', callbackUrl);
  if (name) verifyUrl.searchParams.set('name', name);

  const response = NextResponse.redirect(verifyUrl, { status: 303 });
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  session.jwt = '';
  session.userId = '';
  session.email = '';
  session.name = null;
  session.avatarUrl = null;
  session.isLoggedIn = false;
  session.pendingLogin = {
    email,
    name,
    callbackUrl,
    codeHash: hashLoginCode(email, code),
    expiresAt: getOtpExpiryIso(),
    attempts: 0,
    debugCode: emailResult.debugCode,
  };
  await session.save();

  return response;
}
