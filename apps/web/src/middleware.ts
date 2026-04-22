import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { getSessionOptions, type SessionData } from './lib/session';

const PROTECTED_PATHS = ['/home', '/supermarket', '/products', '/payments'];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const isProtected = PROTECTED_PATHS.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  if (!isProtected) return response;

  // iron-session reads from the request and writes to the response
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());

  if (!session.isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/home/:path*',
    '/supermarket/:path*',
    '/products/:path*',
    '/payments/:path*',
  ],
};
