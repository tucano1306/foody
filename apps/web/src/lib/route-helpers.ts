import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions } from './session';
import type { SessionData } from '@foody/types';

export interface AuthUser {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  householdId?: string | null;
}

export async function getRouteUser(request: NextRequest): Promise<AuthUser | null> {
  const response = new NextResponse();
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  if (!session.isLoggedIn || !session.userId) return null;
  return {
    userId: session.userId,
    email: session.email ?? '',
    name: session.name ?? null,
    avatarUrl: session.avatarUrl ?? null,
  };
}

export function unauthorized() {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ message }, { status: 404 });
}

export function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}
