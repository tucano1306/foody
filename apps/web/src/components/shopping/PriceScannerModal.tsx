'use client';

import { useCallback, useRef, useState } from 'react';

interface Props {
  readonly productName: string;
  readonly onPrice: (price: number) => void;
  readonly onClose: () => void;
}

type ScanState = 'idle' | 'processing' | 'preview' | 'error';

function compressForOcr(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_PX = 1200;
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const grey = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        const contrasted = Math.min(255, Math.max(0, Math.round(1.6 * (grey - 128) + 128)));
        d[i] = contrasted; d[i + 1] = contrasted; d[i + 2] = contrasted;
      }
      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('Error al comprimir')); },
        'image/png',
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
    img.src = url;
  });
}

type PriceQuality = 'strong' | 'weak' | 'none';
interface PriceExtraction {
  readonly prices: readonly number[];
  readonly quality: PriceQuality;
  readonly hasDigits: boolean;
}

// Numbers that look like a price but almost never are:
//  - 4-digit years (1900-2099) when there's no currency / decimal
//  - numbers attached to %  (e.g. "100%")
function isLikelyNonPrice(raw: string, context: string, index: number): boolean {
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1900 && n <= 2099 && raw.length === 4) return true;
  const after = context.slice(index + raw.length, index + raw.length + 2);
  if (after.trimStart().startsWith('%')) return true;
  return false;
}

function extractPrices(text: string): PriceExtraction {
  const strong: number[] = [];
  const weak: number[] = [];
  const seen = new Set<number>();
  const hasDigits = /\d/.test(text);

  const push = (bucket: number[], raw: string) => {
    const n = Number.parseFloat(raw.replaceAll(',', '.'));
    if (!Number.isNaN(n) && n > 0 && n < 10_000 && !seen.has(n)) {
      seen.add(n);
      bucket.push(n);
    }
  };

  // Strong signals: explicit "$" or decimal point/comma
  for (const m of text.matchAll(/\$\s*(\d{1,5}(?:[.,]\d{1,2})?)/g)) push(strong, m[1]);
  for (const m of text.matchAll(/\b(\d{1,4}[.,]\d{2})\b/g)) push(strong, m[1]);

  // Weak signal: bare integers — only useful when no strong matches
  if (strong.length === 0) {
    for (const m of text.matchAll(/\b(\d{2,4})\b/g)) {
      if (m.index === undefined) continue;
      if (isLikelyNonPrice(m[1], text, m.index)) continue;
      push(weak, m[1]);
    }
  }

  let quality: PriceQuality;
  if (strong.length > 0) quality = 'strong';
  else if (weak.length > 0) quality = 'weak';
  else quality = 'none';

  return { prices: strong.length > 0 ? strong : weak, quality, hasDigits };
}

export default function PriceScannerModal({ productName, onPrice, onClose }: Props) {
  const [state, setState] = useState<ScanState>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<number[]>([]);
  const [quality, setQuality] = useState<PriceQuality>('none');
  const [hasDigits, setHasDigits] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const abortRef = useRef(false);

  const processImage = useCallback(async (file: File) => {
    abortRef.current = false;
    setState('processing');
    setErrorMsg(null);
    setPhase('Preparando imagen…');
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let worker: any = null;
    try {
      const compressed = await compressForOcr(file);
      setPhase('Cargando lector OCR…');
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng', 1, {
        workerPath: '/tesseract-worker.min.js',
        corePath: '/tesseract-core',
        langPath: '/tessdata',
        logger: ({ status }: { status: string; progress: number }) => {
          if (status === 'recognizing text') setPhase('Leyendo precio…');
        },
      });
      const { data: { text } } = await worker.recognize(compressed) as { data: { text: string } };
      const result = extractPrices(text);
      setCandidates([...result.prices]);
      setQuality(result.quality);
      setHasDigits(result.hasDigits);
      // Only auto-select when we're confident; for weak matches force user to pick
      setSelected(result.quality === 'strong' ? result.prices[0] ?? null : null);
      setState('preview');
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo leer el precio.');
      setState('error');
    } finally {
      await (worker as { terminate: () => Promise<void> } | null)?.terminate().catch(() => null);
    }
  }, []);

  function openCamera() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void processImage(file);
    });
    input.click();
  }

  function confirm() {
    const manualNum = manual.trim() ? Number.parseFloat(manual.replaceAll(',', '.')) : null;
    const price = selected ?? manualNum;
    if (price !== null && !Number.isNaN(price) && price > 0) {
      onPrice(price);
    } else {
      onClose();
    }
  }

  function handleClose() {
    abortRef.current = true;
    onClose();
  }

  const manualNum = manual.trim() ? Number.parseFloat(manual.replaceAll(',', '.')) : null;
  const canConfirm = selected !== null || (manualNum !== null && manualNum > 0);

  return (
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Cerrar escáner de precio"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        onClick={handleClose}
      />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 flex flex-col gap-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-stone-800 text-base">📷 Escanear precio</h3>
            <p className="text-xs text-stone-400 mt-0.5 truncate max-w-55">{productName}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 transition"
          >
            ✕
          </button>
        </div>

        {/* Preview */}
        {preview && state !== 'idle' && (
          <div className="relative w-full h-44 bg-stone-100 rounded-2xl overflow-hidden border border-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Captura del precio" className="w-full h-full object-cover" />
          </div>
        )}

        {/* idle */}
        {state === 'idle' && (
          <div className="text-center space-y-3 py-1">
            <p className="text-stone-500 text-sm leading-relaxed">
              Apunta la cámara al <strong>precio del producto</strong> y toma una foto.
              El sistema detectará el monto automáticamente.
            </p>
            <button
              type="button"
              onClick={openCamera}
              className="w-full py-3.5 rounded-2xl bg-market-600 hover:bg-market-700 text-white font-bold text-base transition active:scale-[0.97] shadow-md shadow-market-500/20"
            >
              📷 Abrir cámara
            </button>
            <div className="flex items-center gap-2">
              <hr className="flex-1 border-stone-100" />
              <span className="text-xs text-stone-300">o escribe el precio</span>
              <hr className="flex-1 border-stone-100" />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">$</span>
              <input
                id="price-idle-manual"
                type="number"
                min="0"
                step="0.01"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
              />
            </div>
            {manualNum !== null && manualNum > 0 && (
              <button
                type="button"
                onClick={confirm}
                className="w-full py-3 rounded-2xl bg-market-600 text-white font-bold text-sm transition active:scale-[0.97]"
              >
                ✓ Usar ${manualNum.toFixed(2)}
              </button>
            )}
          </div>
        )}

        {/* processing */}
        {state === 'processing' && (
          <div className="text-center py-6 space-y-3">
            <div className="w-10 h-10 border-[3px] border-market-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-stone-500 text-sm">{phase}</p>
          </div>
        )}

        {/* error */}
        {state === 'error' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <p className="text-red-700 text-sm">{errorMsg ?? 'No se pudo leer el precio.'}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={openCamera} className="flex-1 py-2.5 rounded-xl bg-market-600 text-white font-semibold text-sm transition">
                📷 Reintentar
              </button>
              <button type="button" onClick={handleClose} className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm transition">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* preview — detected prices */}
        {state === 'preview' && (
          <div className="space-y-3">
            {quality === 'strong' && candidates.length > 0 && (
              <>
                <p className="text-sm font-semibold text-stone-700">
                  Precios detectados — toca el correcto:
                </p>
                <div className="flex flex-wrap gap-2">
                  {candidates.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setSelected(c); setManual(''); }}
                      className={`px-4 py-2 rounded-xl font-bold text-sm border-2 transition ${
                        selected === c
                          ? 'border-market-500 bg-market-50 text-market-700'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-market-300'
                      }`}
                    >
                      ${c.toFixed(2)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {quality === 'weak' && candidates.length > 0 && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <p className="text-amber-800 text-sm font-semibold">⚠️ No vimos un precio claro</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    Estos números podrían no ser precios. Confirma uno o escríbelo manualmente.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {candidates.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setSelected(c); setManual(''); }}
                      className={`px-4 py-2 rounded-xl font-bold text-sm border-2 transition ${
                        selected === c
                          ? 'border-amber-500 bg-amber-50 text-amber-800'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-amber-300'
                      }`}
                    >
                      ${c.toFixed(2)}?
                    </button>
                  ))}
                </div>
              </>
            )}

            {quality === 'none' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <p className="text-red-800 text-sm font-semibold">
                  {hasDigits ? '⚠️ No parece un precio' : '⚠️ No se detectó texto'}
                </p>
                <p className="text-red-700 text-xs mt-0.5">
                  {hasDigits
                    ? 'No encontramos un valor que parezca un precio. Toma otra foto enfocando solo el monto (ej. $12.99) o escríbelo abajo.'
                    : 'La foto está borrosa o no muestra números. Reintenta acercando la cámara al precio.'}
                </p>
              </div>
            )}

            <div>
              <label htmlFor="price-preview-manual" className="block text-xs text-stone-500 mb-1 font-medium">
                {candidates.length > 0 ? 'O ingresa manualmente:' : 'Precio:'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-semibold text-sm">$</span>
                <input
                  id="price-preview-manual"
                  type="number"
                  min="0"
                  step="0.01"
                  value={manual}
                  onChange={(e) => { setManual(e.target.value); setSelected(null); }}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-market-300 transition"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={openCamera}
                className="py-2.5 px-4 rounded-xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition"
              >
                📷
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm}
                className="flex-1 py-2.5 rounded-xl bg-market-600 text-white font-bold text-sm disabled:opacity-40 transition active:scale-[0.97]"
              >
                ✓ Usar precio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
