import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getRouteUser, unauthorized } from '@/lib/route-helpers';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Las fotos ya llegan comprimidas desde el navegador; esto es solo un tope. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/upload/photo — sube una foto de producto al almacenamiento de
 * archivos y devuelve su URL pública.
 *
 * Antes las fotos se guardaban como data URL base64 dentro de products.photo_url:
 * una fila pesaba ~200 KB y CADA lectura de la lista de productos las arrastraba
 * enteras, lo que agotó la cuota de transferencia de la base de datos. Aquí la
 * imagen sale de Postgres y en la fila queda solo la URL (~100 bytes).
 *
 * Requiere BLOB_READ_WRITE_TOKEN, que Vercel inyecta al conectar un Blob store
 * al proyecto. Sin esa variable la ruta responde 503 y el formulario cae al
 * modo anterior (guardar la imagen embebida), para no bloquear al usuario.
 */
export async function POST(request: NextRequest) {
  const user = await getRouteUser(request);
  if (!user) return unauthorized();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'Almacenamiento de fotos no configurado' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: 'Formulario inválido' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ message: 'Falta el archivo' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ message: 'El archivo está vacío' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: 'La imagen es demasiado grande' }, { status: 413 });
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ message: 'Formato de imagen no soportado' }, { status: 415 });
  }

  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';

  try {
    // addRandomSuffix evita que la URL sea adivinable a partir del id del usuario.
    const blob = await put(`products/${user.userId}/photo.${extension}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || 'image/jpeg',
      cacheControlMaxAge: 31_536_000, // un año: la URL es única por subida
    });
    return NextResponse.json({ url: blob.url }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al subir la imagen';
    return NextResponse.json({ message }, { status: 500 });
  }
}
