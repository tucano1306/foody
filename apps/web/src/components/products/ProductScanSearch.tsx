'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product, StockLevel } from '@foody/types';
import {
  startNativeDetector,
  startPlainCamera,
  startZxingScanner,
  type ScanControls,
} from '@/lib/barcode-camera';
import { rankProductsByScanText, type ScanCandidate } from '@/lib/scan-product-search';
import { ocrScale } from '@/lib/price-scan';
import { categoryEmoji } from '@/lib/categories';

interface Props {
  readonly products: readonly Product[];
  readonly onSelect: (product: Product) => void;
  readonly onClose: () => void;
}

type ScanState = 'starting' | 'scanning' | 'processing' | 'results' | 'error';

interface ScanResults {
  readonly candidates: ScanCandidate<Product>[];
  /** What the camera understood, shown above the matches ("Código: …" / Texto leído). */
  readonly detectedLabel: string | null;
  /** Guidance shown when there are no candidates. */
  readonly emptyHint: string;
}

const STOCK_BADGE: Readonly<Record<StockLevel, { label: string; cls: string }>> = {
  full: { label: 'OK', cls: 'bg-green-100 text-green-700' },
  half: { label: 'Mitad', cls: 'bg-amber-100 text-amber-700' },
  empty: { label: 'Sin stock', cls: 'bg-red-100 text-red-600' },
};

/** Current video frame → JPEG blob, scaled to the OCR sweet spot. */
function captureFrameBlob(video: HTMLVideoElement): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return Promise.resolve(null);
  const scale = ocrScale(Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
}

/** Gallery photo → JPEG blob at OCR scale (no binarisation: labels are colourful). */
function downscaleImage(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = ocrScale(Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('Error al procesar la imagen')); },
        'image/jpeg',
        0.92,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
    img.src = url;
  });
}

/**
 * OCR the label and rank the catalog. Sparse mode first (big scattered brand
 * text); when nothing matches, retry as a single block and merge both reads.
 */
async function ocrAndRank(
  blob: Blob,
  products: readonly Product[],
  setPhase: (phase: string) => void,
): Promise<{ text: string; candidates: ScanCandidate<Product>[] }> {
  setPhase('Cargando lector…');
  const { createWorker, PSM } = await import('tesseract.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker: any = await createWorker('eng', 1, {
    workerPath: '/tesseract-worker.min.js',
    corePath: '/tesseract-core',
    langPath: '/tessdata',
    logger: ({ status }: { status: string; progress: number }) => {
      if (status === 'recognizing text') setPhase('Leyendo etiqueta…');
    },
  });
  try {
    await worker.setParameters({
      user_defined_dpi: '300',
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    });
    const pass1 = await worker.recognize(blob);
    let text: string = pass1.data.text ?? '';
    let candidates = rankProductsByScanText(text, products);

    if (candidates.length === 0) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const pass2 = await worker.recognize(blob);
      text = `${text}\n${pass2.data.text ?? ''}`;
      candidates = rankProductsByScanText(text, products);
    }
    return { text, candidates };
  } finally {
    await (worker as { terminate: () => Promise<void> }).terminate().catch(() => null);
  }
}

export default function ProductScanSearch({ products, onSelect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScanControls | null>(null);
  const detectedRef = useRef(false);
  const mountedRef = useRef(true);
  const previewUrlRef = useRef<string | null>(null);

  const [scanState, setScanState] = useState<ScanState>('starting');
  const [scanKey, setScanKey] = useState(0);
  const [barcodeEnabled, setBarcodeEnabled] = useState(true);
  const [phase, setPhase] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const setPreviewUrl = useCallback((url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreview(url);
  }, []);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  /** Barcode detected → resolve a name via Open Food Facts → rank the pantry. */
  const handleBarcode = useCallback(async (code: string) => {
    setScanState('processing');
    setPhase('Buscando código…');
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as { found: boolean; name?: string };
      if (!mountedRef.current) return;

      const name = data.found ? (data.name ?? '').trim() : '';
      if (name) {
        setResults({
          candidates: rankProductsByScanText(name, products),
          detectedLabel: `Código: ${name}`,
          emptyHint: `El código corresponde a «${name}», pero no encontramos ese producto en tu despensa.`,
        });
      } else {
        setResults({
          candidates: [],
          detectedLabel: null,
          emptyHint: 'Código no reconocido. Prueba tomar una foto del nombre del producto.',
        });
      }
      setScanState('results');
    } catch {
      if (!mountedRef.current) return;
      setResults({
        candidates: [],
        detectedLabel: null,
        emptyHint: 'Sin conexión para consultar el código. Prueba tomar una foto del nombre.',
      });
      setScanState('results');
    }
  }, [products]);

  /** Photo (capture or gallery) → OCR → rank the pantry. */
  const processImage = useCallback(async (blob: Blob) => {
    setScanState('processing');
    setPhase('Preparando imagen…');
    setPreviewUrl(URL.createObjectURL(blob));
    try {
      const { text, candidates } = await ocrAndRank(blob, products, setPhase);
      if (!mountedRef.current) return;
      const snippet = text.replaceAll(/\s+/g, ' ').trim().slice(0, 70);
      setResults({
        candidates,
        detectedLabel: snippet ? `Texto leído: “${snippet}”` : null,
        emptyHint: snippet
          ? 'No encontramos coincidencias en tu despensa. Acércate al nombre del producto e inténtalo de nuevo.'
          : 'No se detectó texto en la foto. Enfoca el nombre del producto con buena luz.',
      });
      setScanState('results');
    } catch {
      if (!mountedRef.current) return;
      setErrorMsg('No se pudo leer la foto. Inténtalo de nuevo.');
      setScanState('error');
    }
  }, [products, setPreviewUrl]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    detectedRef.current = true; // silence the barcode loop while we capture
    const blob = await captureFrameBlob(video);
    stopCamera();
    if (blob) {
      void processImage(blob);
    } else {
      setErrorMsg('No se pudo capturar la imagen.');
      setScanState('error');
    }
  }, [processImage, stopCamera]);

  const openGallery = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      detectedRef.current = true;
      stopCamera();
      downscaleImage(file)
        .then((blob) => processImage(blob))
        .catch(() => {
          setErrorMsg('No se pudo abrir la imagen.');
          setScanState('error');
        });
    });
    input.click();
  }, [processImage, stopCamera]);

  // Start camera + barcode detection; falls back to a plain preview so the
  // photo path still works when no barcode engine is available.
  useEffect(() => {
    let cancelled = false;
    detectedRef.current = false;
    setScanState('starting');
    setErrorMsg(null);

    async function start() {
      const video = videoRef.current;
      if (cancelled || !video) return;

      const onCode = (code: string) => {
        if (detectedRef.current) return;
        detectedRef.current = true;
        stopCamera();
        void handleBarcode(code);
      };

      try {
        let controls = await startNativeDetector(video, onCode);
        let withBarcode = controls !== null;
        if (!controls) {
          try {
            controls = await startZxingScanner(video, onCode);
            withBarcode = true;
          } catch (err) {
            // Re-throw camera/permission failures; only swallow engine load issues.
            if (err instanceof DOMException) throw err;
            controls = await startPlainCamera(video);
            withBarcode = false;
          }
        }
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setBarcodeEnabled(withBarcode);
        setScanState('scanning');
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name.toLowerCase() : '';
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        const denied = [name, msg].some(
          (s) => s.includes('permission') || s.includes('denied') || s.includes('notallowed'),
        );
        setErrorMsg(
          denied
            ? 'Permite el acceso a la cámara en tu navegador'
            : 'No se pudo iniciar la cámara',
        );
        setScanState('error');
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [scanKey, handleBarcode, stopCamera]);

  // Release resources when the modal unmounts.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const rescan = useCallback(() => {
    setResults(null);
    setPreviewUrl(null);
    setScanKey((k) => k + 1);
  }, [setPreviewUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-white text-sm font-semibold">Buscar producto con la cámara</p>
        <button
          type="button"
          aria-label="Cerrar buscador"
          onClick={onClose}
          className="p-2 rounded-xl text-white hover:bg-white/10 transition text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* ─── Camera view ──────────────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {scanState === 'scanning' && (
          <>
            {/* Guide frame */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative w-64 h-64">
                <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-brand-400 rounded-tl" />
                <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-brand-400 rounded-tr" />
                <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-brand-400 rounded-bl" />
                <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-brand-400 rounded-br" />
              </div>
              <p className="mt-4 px-6 text-white/80 text-xs font-medium tracking-wide text-center">
                {barcodeEnabled
                  ? 'Apunta al código de barras o toma una foto del nombre'
                  : 'Toma una foto del nombre del producto'}
              </p>
            </div>

            {/* Capture controls */}
            <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={openGallery}
                aria-label="Buscar con una foto de la galería"
                className="w-12 h-12 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30 transition"
              >
                📁
              </button>
              <button
                type="button"
                onClick={() => void capturePhoto()}
                aria-label="Tomar foto del producto"
                className="w-18 h-18 rounded-full border-4 border-white bg-white/30 hover:bg-white/50 transition active:scale-95"
              />
              {/* Spacer to keep the shutter centred */}
              <span className="w-12 h-12" aria-hidden />
            </div>
          </>
        )}

        {(scanState === 'starting' || scanState === 'processing') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 px-6">
            <div className="w-10 h-10 rounded-full border-4 border-brand-400/40 border-t-brand-400 animate-spin mb-4" />
            <p className="text-white text-sm font-semibold text-center leading-snug">
              {scanState === 'starting' ? 'Iniciando cámara...' : phase}
            </p>
          </div>
        )}

        {scanState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 px-6">
            <p className="text-4xl mb-3">📵</p>
            <p className="text-white text-sm font-semibold text-center leading-snug">
              {errorMsg ?? 'Error de cámara'}
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={rescan}
                className="px-5 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm transition hover:bg-brand-600"
              >
                Intentar de nuevo
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="px-5 py-2.5 rounded-xl bg-white/20 text-white font-semibold text-sm transition hover:bg-white/30"
              >
                📁 Subir foto
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 px-5 py-2 text-white/60 font-medium text-sm hover:text-white transition"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ─── Results sheet ──────────────────────────────────────────────── */}
        {scanState === 'results' && results && (
          <div className="absolute inset-x-0 bottom-0 max-h-[75%] flex flex-col bg-white rounded-t-3xl shadow-2xl">
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-stone-200" aria-hidden />
            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] overflow-y-auto space-y-3">
              <div className="flex items-start gap-3">
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Foto del producto"
                    className="w-16 h-16 rounded-xl object-cover border border-stone-200 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-stone-800 text-base">
                    {results.candidates.length > 0
                      ? 'Coincidencias en tu despensa'
                      : 'Sin coincidencias'}
                  </h3>
                  {results.detectedLabel && (
                    <p className="text-xs text-stone-400 mt-0.5 break-words">
                      {results.detectedLabel}
                    </p>
                  )}
                </div>
              </div>

              {results.candidates.length > 0 ? (
                <ul className="space-y-2">
                  {results.candidates.map(({ product }) => {
                    const badge = STOCK_BADGE[product.stockLevel ?? 'full'];
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(product)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 active:scale-[0.98] transition text-left"
                        >
                          {product.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.photoUrl}
                              alt=""
                              className="w-11 h-11 rounded-xl object-cover border border-stone-100 shrink-0"
                            />
                          ) : (
                            <span className="w-11 h-11 rounded-xl bg-stone-100 flex items-center justify-center text-xl shrink-0">
                              {categoryEmoji(product.category)}
                            </span>
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-stone-800 text-sm truncate">
                              {product.name}
                            </span>
                            {product.category && (
                              <span className="block text-xs text-stone-400 truncate">
                                {product.category}
                              </span>
                            )}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-stone-500 leading-relaxed">{results.emptyHint}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={rescan}
                  className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition"
                >
                  🔄 Escanear otra vez
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
