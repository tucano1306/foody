import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '@/lib/session';
import { normalizeCallbackUrl } from '@/lib/login-otp';
import { emailToUuid, signJWT } from '@/lib/server-auth';
import { sql } from '@/lib/db';
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

  const userId = emailToUuid(email);

  try {
    await sql`
      INSERT INTO users (id, email, name, avatar_url, created_at, updated_at)
      VALUES (${userId}, ${email}, ${name}, null, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, users.name),
        updated_at = NOW()
    `;
  } catch (err) {
    console.error('[login] upsert user failed:', err);
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'server_error');
    return NextResponse.redirect(url, { status: 303 });
  }

  const jwt = await signJWT({ sub: userId, email, name, avatarUrl: null });

  const redirectResponse = NextResponse.redirect(new URL(callbackUrl, request.url), { status: 303 });
  const session = await getIronSession<SessionData>(request, redirectResponse, getSessionOptions());
  session.jwt = jwt;
  session.userId = userId;
  session.email = email;
  session.name = name;
  session.avatarUrl = null;
  session.isLoggedIn = true;
  session.pendingLogin = undefined;
  await session.save();

  return redirectResponse;
}
