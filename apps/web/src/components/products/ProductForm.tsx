'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Product, CreateProductDto } from '@foody/types';
import type { BarcodeScanResult } from './BarcodeScanner';

const BarcodeScanner = dynamic(() => import('./BarcodeScanner'), { ssr: false });

const MAX_IMAGE_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = 'JPG, PNG, WEBP, GIF, HEIC, HEIF';
const MAX_OUTPUT_DIMENSION = 512;
const COMPRESS_TIMEOUT_MS = 30_000;
const HEIC_CONVERT_TIMEOUT_MS = 60_000;

const CATEGORIES = [
  'Frutas y Verduras',
  'Lácteos',
  'Carnicería',
  'Pescadería',
  'Panadería y Tortillería',
  'Granos y Legumbres',
  'Cereales y Desayunos',
  'Enlatados',
  'Congelados',
  'Snacks y Dulces',
  'Condimentos y Salsas',
  'Bebidas',
  'Limpieza',
  'Higiene y Cuidado',
  'Mascotas',
  'Otro',
];

interface Props {
  readonly product?: Product;
  readonly inHousehold?: boolean;
}

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'image/heic'
    || file.type === 'image/heif'
    || name.endsWith('.heic')
    || name.endsWith('.heif');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} tardó demasiado. Intenta con otra foto.`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface LoadedImage {
  img: HTMLImageElement;
  release: () => void;
}

function loadImageFromBlob(file: Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new globalThis.Image();
    let settled = false;
    const release = () => URL.revokeObjectURL(url);

    img.onload = () => {
      if (settled) return;
      // Use img.decode() to ensure pixel data is available (prevents naturalWidth=0 on async decode)
      const decoded = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
      decoded.then(() => {
        if (settled) return;
        settled = true;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          release();
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        resolve({ img, release });
      }).catch(() => {
        if (settled) return;
        settled = true;
        release();
        reject(new Error('No se pudo procesar la imagen'));
      });
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      release();
      reject(new Error('No se pudo procesar la imagen'));
    };

    img.src = url;
  });
}

async function compressViaImageBitmap(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width === 0 || bitmap.height === 0) {
    bitmap.close();
    throw new Error('No se pudo procesar la imagen');
  }
  const sizes = [MAX_OUTPUT_DIMENSION, 384, 256];
  let lastErr: unknown;
  try {
    for (const size of sizes) {
      const canvas = document.createElement('canvas');
      try {
        const { w, h } = computeFitDimensions(bitmap.width, bitmap.height, size);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas no disponible');
        ctx.drawImage(bitmap, 0, 0, w, h);
        return await canvasToJpegDataUrl(canvas);
      } catch (err) {
        lastErr = err;
      } finally {
        // Free the canvas before the next (smaller) attempt — critical on
        // low-memory mobile devices to avoid "falta de memoria" errors.
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    bitmap.close();
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo procesar la imagen');
}

async function convertHeicToJpegBlob(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const res = await withTimeout(
    fetch('/api/upload/heic', { method: 'POST', body: formData, credentials: 'include' }),
    HEIC_CONVERT_TIMEOUT_MS,
    'La conversión HEIC',
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: 'No se pudo convertir la foto HEIC' }));
    throw new Error(data.message ?? 'No se pudo convertir la foto HEIC');
  }
  const { dataUrl } = (await res.json()) as { dataUrl: string };
  const resp = await fetch(dataUrl);
  return resp.blob();
}

function computeFitDimensions(srcWidth: number, srcHeight: number, max: number): { w: number; h: number } {
  if (srcWidth <= max && srcHeight <= max) return { w: srcWidth, h: srcHeight };
  if (srcWidth > srcHeight) return { w: max, h: Math.max(1, Math.round((srcHeight * max) / srcWidth)) };
  return { w: Math.max(1, Math.round((srcWidth * max) / srcHeight)), h: max };
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  // toBlob es mucho más estable en iOS Safari que toDataURL con imágenes grandes
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('No se pudo procesar la imagen'));
            return;
          }
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('No se pudo procesar la imagen'));
          reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
              reject(new Error('No se pudo procesar la imagen'));
              return;
            }
            resolve(result);
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.72,
      );
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      if (!dataUrl || dataUrl === 'data:,') {
        reject(new Error('No se pudo procesar la imagen'));
        return;
      }
      resolve(dataUrl);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('No se pudo procesar la imagen'));
    }
  });
}

async function drawToJpegAtMax(img: HTMLImageElement, max: number): Promise<string> {
  const { w, h } = computeFitDimensions(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.drawImage(img, 0, 0, w, h);
    return await canvasToJpegDataUrl(canvas);
  } finally {
    // Release canvas pixels once the JPEG is encoded so a failed retry doesn't
    // keep stacking large buffers in memory.
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function compressLoadedImage(img: HTMLImageElement): Promise<string> {
  // Si el primer intento falla por OOM en móvil, reintentar con tamaños menores
  const sizes = [MAX_OUTPUT_DIMENSION, 384, 256];
  let lastErr: unknown;
  for (const size of sizes) {
    try {
      return await drawToJpegAtMax(img, size);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo procesar la imagen');
}

// Fallback: lee el archivo como data URL y lo carga en un <img>.
// Funciona con HEIC en iOS Safari cuando el object URL falla.
function loadImageViaDataUrl(file: Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = (e) => onReaderLoad(e, resolve, reject);
    reader.readAsDataURL(file);
  });
}

function onReaderLoad(
  e: ProgressEvent<FileReader>,
  resolve: (v: LoadedImage) => void,
  reject: (err: Error) => void,
): void {
  const src = e.target?.result;
  if (typeof src !== 'string' || !src) {
    reject(new Error('No se pudo leer el archivo'));
    return;
  }
  const img = new globalThis.Image();
  let settled = false;
  img.onload = () => {
    if (settled) return;
    settled = true;
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      reject(new Error('No se pudo procesar la imagen'));
      return;
    }
    resolve({ img, release: noop });
  };
  img.onerror = () => {
    if (settled) return;
    settled = true;
    reject(new Error('No se pudo procesar la imagen'));
  };
  img.src = src;
}

function noop(): void { /* data URL — nada que liberar */ }

async function loadAndCompressInner(file: File): Promise<string> {
  // 0. createImageBitmap — nativo del browser, decodifica HEIC en iOS Safari 15+
  if (typeof createImageBitmap !== 'undefined') {
    try {
      return await compressViaImageBitmap(file);
    } catch { /* fall through */ }
  }

  // 1. Object URL → <img> element
  let loaded: LoadedImage | null = null;
  try {
    loaded = await loadImageFromBlob(file);
  } catch {
    // 2. FileReader → data URL → <img>
    try {
      loaded = await loadImageViaDataUrl(file);
    } catch {
      // 3. Último recurso: servidor HEIC (solo archivos <4 MB por límite Vercel)
      if (!isHeicFile(file)) throw new Error('No se pudo procesar la imagen');
      if (file.size > 4 * 1024 * 1024) {
        throw new Error(
          'Foto demasiado grande. En tu iPhone ve a Ajustes > Cámara > Formatos > Más Compatible y vuelve a intentarlo.',
        );
      }
      const jpegBlob = await convertHeicToJpegBlob(file).catch((err: unknown) => {
        throw err instanceof Error ? err : new Error(
          'No se pudo convertir la foto. En tu iPhone ve a Ajustes > Cámara > Formatos > Más Compatible.',
        );
      });
      loaded = await loadImageFromBlob(jpegBlob);
    }
  }
  try {
    return await compressLoadedImage(loaded.img);
  } finally {
    loaded.release();
  }
}

function compressImage(file: File): Promise<string> {
  return withTimeout(loadAndCompressInner(file), COMPRESS_TIMEOUT_MS, 'La compresión de la imagen');
}

export default function ProductForm({ product, inHousehold }: Props) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  const [form, setForm] = useState<CreateProductDto>({
    name: product?.name ?? '',
    description: product?.description ?? '',
    category: product?.category ?? '',
    currentQuantity: product?.currentQuantity ?? 0,
    minQuantity: product?.minQuantity ?? 1,
    unit: product?.unit ?? 'unidades',
    photoUrl: product?.photoUrl ?? undefined,
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(product?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  function handleBarcodeResult(data: BarcodeScanResult) {
    setForm((f) => ({
      ...f,
      name: data.name || f.name,
      category: data.category || f.category,
      ...(data.photoUrl ? { photoUrl: data.photoUrl } : {}),
    }));
    if (data.photoUrl) setPhotoPreview(data.photoUrl);
    setScannerOpen(false);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const isImage = file.type.startsWith('image/') || file.type === '';
      if (!isImage && !isHeicFile(file)) {
        throw new Error(`Formato no compatible. Usa ${ACCEPTED_IMAGE_TYPES}.`);
      }

      if (file.size > MAX_IMAGE_FILE_SIZE) {
        throw new Error('La foto es muy pesada. Usa una imagen menor a 15 MB.');
      }

      const dataUrl = await compressImage(file);
      setForm((f) => ({ ...f, photoUrl: dataUrl }));
      setPhotoPreview(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();

    // The photo is still being compressed — submitting now would save the
    // product without its image. Wait for it to finish.
    if (uploading) {
      setError('Espera a que termine de procesarse la foto.');
      return;
    }

    setSaving(true);
    setError(null);

    if (!form.name?.trim()) {
      setError('El nombre del producto es obligatorio');
      setSaving(false);
      return;
    }

    try {
      const url = product
        ? `/api/proxy/products/${product.id}`
        : `/api/proxy/products`;

      const res = await fetch(url, {
        method: product ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, isPrivate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? 'Error al guardar');
      }

      // Navigate first, then refresh so the *destination* (/products) re-fetches
      // fresh server data. Refreshing before the push only revalidates the form
      // route and lands on a stale, cached product list.
      router.push('/products');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {scannerOpen && (
        <BarcodeScanner
          onResult={handleBarcodeResult}
          onClose={() => setScannerOpen(false)}
        />
      )}

    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ─── Barcode scan (only when creating a new product) ──────────── */}
      {!product && (
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-300 hover:border-brand-500 hover:bg-brand-50 text-brand-600 font-semibold text-sm transition"
        >
          <span className="text-lg leading-none" aria-hidden="true">📷</span>{' '}
          Escanear código de barras
        </button>
      )}

      {/* ─── Photo upload ──────────────────────────────────────────────────── */}
      <div>
        <span className="block text-sm font-medium text-stone-700 mb-2">
          Foto del producto
        </span>
        <div className="border-2 border-dashed border-stone-200 rounded-2xl p-4">
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="preview"
              className="h-32 object-contain mx-auto rounded-xl"
            />
          ) : (
            <div className="py-6 text-center">
              <span className="text-3xl">📷</span>
              <p className="text-sm text-stone-400 mt-2">
                {uploading ? 'Subiendo...' : 'Agrega una foto'}
              </p>
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition"
            >
              📸 Cámara
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <p className="mt-3 text-xs text-stone-400 text-center">
            Formatos: {ACCEPTED_IMAGE_TYPES}. La app los optimiza y los guarda como JPEG.
          </p>
        </div>
      </div>

      {/* ─── Name ─────────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="product-name" className="block text-sm font-medium text-stone-700 mb-1">
          Nombre *
        </label>
        <input
          id="product-name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Leche"
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
        />
      </div>

      {/* ─── Category ─────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="product-category" className="block text-sm font-medium text-stone-700 mb-1">Categoría</label>
        <select
          id="product-category"
          value={CATEGORIES.includes(form.category ?? '') ? (form.category ?? '') : '__other__'}
          onChange={(e) => {
            if (e.target.value === '__other__') {
              setForm((f) => ({ ...f, category: '' }));
            } else {
              setForm((f) => ({ ...f, category: e.target.value }));
            }
          }}
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition bg-white"
        >
          <option value="">— Sin categoría —</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__other__">Otra…</option>
        </select>
        {(!CATEGORIES.includes(form.category ?? '') && form.category !== undefined) && (
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="Escribe la categoría…"
            className="mt-2 w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        )}
      </div>

      {/* ─── Description ──────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="product-desc" className="block text-sm font-medium text-stone-700 mb-1">Descripción</label>
        <textarea
          id="product-desc"
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Descripción opcional..."
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition resize-none"
        />
      </div>

      {/* ─── Private toggle (only when in a household) ───────────────────── */}
      {inHousehold && !product && (
        <button
          type="button"
          onClick={() => setIsPrivate((v) => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition ${
            isPrivate
              ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
              : 'border-stone-200 bg-stone-50 dark:bg-stone-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{isPrivate ? '🔒' : '👨‍👩‍👧'}</span>
            <div className="text-left">
              <p className={`text-sm font-semibold ${ isPrivate ? 'text-brand-600 dark:text-brand-400' : 'text-stone-700 dark:text-stone-200' }`}>
                {isPrivate ? 'Solo para mí' : 'Compartido con el hogar'}
              </p>
              <p className="text-xs text-stone-400">
                {isPrivate ? 'Tu familia no verá este producto' : 'Visible para todos en tu hogar'}
              </p>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors ${ isPrivate ? 'bg-brand-500' : 'bg-stone-300 dark:bg-stone-600' }`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-transform ${ isPrivate ? 'translate-x-5' : 'translate-x-0.5' }`} />
          </div>
        </button>
      )}

      {/* ─── Submit ───────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={saving || uploading}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {getSubmitLabel(saving, Boolean(product))}
      </button>
    </form>
    </>
  );
}

function getSubmitLabel(saving: boolean, isEditing: boolean): string {
  if (saving) return 'Guardando...';
  return isEditing ? 'Actualizar producto' : 'Agregar producto';
}
