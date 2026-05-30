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

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const mod = await import('heic-convert');
    const convert = mod.default;
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.78,
    });
    const base64 = Buffer.from(outputBuffer).toString('base64');
    return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${base64}` });
  } catch (err) {
    console.error('[upload/heic] conversion failed:', err);
    return NextResponse.json({ message: 'No se pudo convertir la foto HEIC' }, { status: 500 });
  }
}
