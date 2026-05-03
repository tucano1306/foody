'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, CreateProductDto } from '@foody/types';

const MAX_IMAGE_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = 'JPG, PNG, WEBP, GIF, HEIC, HEIF';

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

async function normalizeImageFile(file: File): Promise<File | Blob> {
  if (!isHeicFile(file)) return file;

  const mod = await import('heic2any');
  const convert = mod.default;
  const converted = await convert({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.82,
  });

  return Array.isArray(converted) ? converted[0] : converted;
}

function drawBitmapToJpeg(source: CanvasImageSource, srcWidth: number, srcHeight: number): string {
  const MAX = 640;
  let w = srcWidth;
  let h = srcHeight;
  if (w > MAX || h > MAX) {
    if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
    else { w = Math.round((w * MAX) / h); h = MAX; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function compressViaFileReader(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = (evt) => {
      const src = evt.target?.result;
      if (typeof src !== 'string') { reject(new Error('No se pudo leer el archivo')); return; }
      const img = new globalThis.Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.onload = () => {
        try { resolve(drawBitmapToJpeg(img, img.naturalWidth, img.naturalHeight)); }
        catch (e) { reject(e); }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File | Blob): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
      .then((bmp) => {
        const result = drawBitmapToJpeg(bmp, bmp.width, bmp.height);
        bmp.close();
        return result;
      })
      .catch(() => compressViaFileReader(file));
  }
  return compressViaFileReader(file);
}

export default function ProductForm({ product, inHousehold }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  const [form, setForm] = useState<CreateProductDto>({
    name: product?.name ?? '',
    description: product?.description ?? '',
    category: product?.category ?? '',
    currentQuantity: product?.currentQuantity ?? 0,
    minQuantity: product?.minQuantity ?? 1,
    unit: product?.unit ?? 'unidades',
    photoUrl: product?.photoUrl ?? '',
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(product?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      if (!file.type.startsWith('image/') && !isHeicFile(file)) {
        throw new Error(`Formato no compatible. Usa ${ACCEPTED_IMAGE_TYPES}.`);
      }

      if (file.size > MAX_IMAGE_FILE_SIZE) {
        throw new Error('La foto es muy pesada. Usa una imagen menor a 15 MB.');
      }

      const normalizedFile = await normalizeImageFile(file);
      const dataUrl = await compressImage(normalizedFile);
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
    setSaving(true);
    setError(null);

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

      router.push('/products');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition"
            >
              📸 Cámara
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold transition"
            >
              🖼️ Galería
            </button>
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
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
  );
}

function getSubmitLabel(saving: boolean, isEditing: boolean): string {
  if (saving) return 'Guardando...';
  return isEditing ? 'Actualizar producto' : 'Agregar producto';
}
