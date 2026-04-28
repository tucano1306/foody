'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, CreateProductDto } from '@foody/types';
import BarcodeScanner from './BarcodeScanner';

const CATEGORIES = [
  'Lácteos', 'Carnes', 'Frutas y Verduras', 'Panadería',
  'Bebidas', 'Limpieza', 'Higiene', 'Congelados', 'Enlatados', 'Otro',
];

interface Props {
  readonly product?: Product;
}

export default function ProductForm({ product }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  async function handleBarcode(code: string) {
    setScanning(false);
    setLookingUp(true);
    setError(null);
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
      );
      if (res.ok) {
        const data = await res.json();
        const p = data?.product;
        if (p) {
          setForm((f) => ({
            ...f,
            name: f.name || p.product_name_es || p.product_name || f.name,
            category: f.category || (p.categories_tags?.[0]?.split(':').pop() ?? f.category),
            description: f.description || p.brands || f.description,
            photoUrl: f.photoUrl || p.image_front_small_url || f.photoUrl,
          }));
          if (!photoPreview && p.image_front_small_url) {
            setPhotoPreview(p.image_front_small_url);
          }
        } else {
          setError('Código no encontrado en la base de datos — rellena manualmente.');
        }
      }
    } catch {
      setError('No se pudo consultar el código. Rellena manualmente.');
    } finally {
      setLookingUp(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // 1. Get presigned URL from API
      const urlRes = await fetch(
        `/api/proxy/products/upload-url?fileName=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { credentials: 'include' },
      );

      if (!urlRes.ok) throw new Error('No se pudo obtener URL de carga');

      const { uploadUrl, fileUrl } = await urlRes.json();

      // 2. Upload directly to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      setForm((f) => ({ ...f, photoUrl: fileUrl }));
      setPhotoPreview(fileUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
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
        body: JSON.stringify(form),
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
      {scanning && (
        <BarcodeScanner
          onDetected={handleBarcode}
          onClose={() => setScanning(false)}
        />
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ─── Barcode scan ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setScanning(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-300 text-brand-600 font-semibold hover:bg-brand-50 transition"
      >
        {lookingUp ? 'Consultando producto...' : '📦 Escanear código de barras'}
      </button>

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
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
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
        <input
          id="product-category"
          list="category-options"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          placeholder="Selecciona o escribe una categoría…"
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition bg-white"
        />
        <datalist id="category-options">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {/* ─── Quantity + Unit ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label htmlFor="product-qty" className="block text-sm font-medium text-stone-700 mb-1">Cantidad</label>
          <input
            id="product-qty"
            type="number"
            min={0}
            step="0.01"
            value={form.currentQuantity}
            onChange={(e) => setForm((f) => ({ ...f, currentQuantity: Number.parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        </div>
        <div className="col-span-1">
          <label htmlFor="product-min" className="block text-sm font-medium text-stone-700 mb-1">Mínimo</label>
          <input
            id="product-min"
            type="number"
            min={0}
            step="0.01"
            value={form.minQuantity}
            onChange={(e) => setForm((f) => ({ ...f, minQuantity: Number.parseFloat(e.target.value) || 1 }))}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        </div>
        <div className="col-span-1">
          <label htmlFor="product-unit" className="block text-sm font-medium text-stone-700 mb-1">Unidad</label>
          <input
            id="product-unit"
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            placeholder="unidades"
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-brand-300 transition"
          />
        </div>
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
