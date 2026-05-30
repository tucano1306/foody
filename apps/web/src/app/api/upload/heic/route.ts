import { NextRequest, NextResponse } from 'next/server';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ message: 'Missing file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: 'File too large' }, { status: 413 });
  }

  const inputArrayBuffer = await file.arrayBuffer();
  // heic-convert needs a Node.js Buffer (Uint8Array subclass)
  const inputBuffer = Buffer.from(new Uint8Array(inputArrayBuffer));

  try {
    const mod = await import('heic-convert');
    // heic-convert is CJS; handle both mod.default and mod itself being the function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convert: (opts: any) => Promise<ArrayBuffer> = (typeof mod.default === 'function' ? mod.default : mod) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.78,
    });
    const base64 = Buffer.from(new Uint8Array(outputBuffer)).toString('base64');
    return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${base64}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload/heic] conversion failed:', message);
    return NextResponse.json({ message: `No se pudo convertir la foto HEIC: ${message}` }, { status: 500 });
  }
}
