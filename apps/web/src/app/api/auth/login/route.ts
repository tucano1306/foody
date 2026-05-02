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

// ─── Simple in-process rate limiter (max 5 requests per IP per 15 min) ───────
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 5;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

interface LoginInput {
  email: string | undefined;
  name: string | null;
  callbackUrl: string;
}

async function parseLoginInput(request: NextRequest): Promise<LoginInput> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      callbackUrl?: string;
    };
    return {
      email: body.email,
      name: body.name?.trim() || null,
      callbackUrl: body.callbackUrl ?? '/home',
    };
  }
  const form = await request.formData();
  const emailValue = form.get('email');
  const nameValue = form.get('name');
  const cbValue = form.get('callbackUrl');
  return {
    email: typeof emailValue === 'string' ? emailValue : undefined,
    name: typeof nameValue === 'string' && nameValue.trim() ? nameValue.trim() : null,
    callbackUrl: typeof cbValue === 'string' && cbValue ? cbValue : '/home',
  };
}

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'too_many_requests');
    return NextResponse.redirect(url, { status: 303 });
  }

  const input = await parseLoginInput(request);
  const email = input.email?.trim().toLowerCase();
  const { name } = input;
  const callbackUrl = normalizeCallbackUrl(input.callbackUrl);

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
