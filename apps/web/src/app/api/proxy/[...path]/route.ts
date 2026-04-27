import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

function mapPath(nestPath: string): string {
  return nestPath;
}

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'transfer-encoding',
    'upgrade',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'host',
    'content-length',
  ]);
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const nestPath = path.join('/');
  const internalPath = mapPath(nestPath);

  // Forward to internal Next.js API (same origin)
  const baseUrl = req.nextUrl.origin;
  const target = new URL(`${baseUrl}/api/${internalPath}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  // Forward cookies so the session is available in the handler
  const headers = new Headers();
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) headers.set('cookie', cookieHeader);
  headers.set('content-type', req.headers.get('content-type') ?? 'application/json');

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ message: 'Bad Gateway' }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path ?? []);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
