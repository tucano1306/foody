import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from '@/lib/session';
import { emailToUuid, signJWT } from '@/lib/server-auth';
import { sql } from '@/lib/db';
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

  if (!email || !EMAIL_RE.test(email)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', 'invalid_email');
    return NextResponse.redirect(url, { status: 303 });
  }

  const userId = emailToUuid(email);

  // Ensure user exists in DB (upsert on login)
  await sql`
    INSERT INTO users (id, email, name, avatar_url, created_at, updated_at)
    VALUES (${userId}, ${email}, ${name}, null, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, users.name),
      updated_at = NOW()
  `;

  const jwt = await signJWT({
    sub: userId,
    email,
    name,
    avatarUrl: null,
  });

  const response = NextResponse.redirect(new URL(callbackUrl, request.url), { status: 303 });
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  session.jwt = jwt;
  session.userId = userId;
  session.email = email;
  session.name = name;
  session.avatarUrl = null;
  session.isLoggedIn = true;
  await session.save();

  return response;
}
