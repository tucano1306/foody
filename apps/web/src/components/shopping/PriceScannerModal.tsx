'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  binarize,
  buildCandidates,
  extractPrices,
  flattenWords,
  ocrScale,
  summarize,
  type OcrBlock,
  type PriceQuality,
  type ScanWord,
} from '@/lib/price-scan';

interface Props {
  readonly productName: string;
  readonly onPrice: (price: number) => void;
  readonly onClose: () => void;
}

type ScanState = 'idle' | 'camera' | 'processing' | 'preview' | 'error';

/** White margin added around the shot so binarised text never touches the edge. */
const OCR_PADDING = 0.04;

// Region-of-interest guide as fractions of the live preview box. A wide, short
// band matches a price; cropping to it removes surrounding shelf noise so the
// OCR only ever sees the number the user framed.
const GUIDE_MX = 0.06; // left/right margin
const GUIDE_MY = 0.34; // top/bottom margin (→ centred band ~32% tall)

/**
 * Crop the framed band out of the live video to a Blob, mapping the on-screen
 * guide (object-cover display) back to the video's intrinsic pixels so what the
 * user sees is exactly what gets read.
 */
function cropRoiToBlob(video: HTMLVideoElement, cw: number, ch: number): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || !cw || !ch) return Promise.resolve(null);
  const scale = Math.max(cw / vw, ch / vh); // object-cover fill factor
  const offX = (vw * scale - cw) / 2;
  const offY = (vh * scale - ch) / 2;
  const sx = (GUIDE_MX * cw + offX) / scale;
  const sy = (GUIDE_MY * ch + offY) / scale;
  const sw = ((1 - 2 * GUIDE_MX) * cw) / scale;
  const sh = ((1 - 2 * GUIDE_MY) * ch) / scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95));
}

function compressForOcr(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = ocrScale(Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const pad = Math.round(Math.max(w, h) * OCR_PADDING);
      const canvas = document.createElement('canvas');
      canvas.width = w + pad * 2;
      canvas.height = h + pad * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }
      // Paint a white background + margin first, then the (binarised) photo.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, w, h);
      const imageData = ctx.getImageData(pad, pad, w, h);
      binarize(imageData);
      ctx.putImageData(imageData, pad, pad);
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('Error al comprimir')); },
        'image/png',
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
    img.src = url;
  });
}

interface OcrPage { text: string; blocks: OcrBlock[] | null }
interface OcrWorker {
  setParameters(params: Record<string, unknown>): Promise<unknown>;
  recognize(
    image: Blob,
    options?: Record<string, unknown>,
    output?: Record<string, unknown>,
  ): Promise<{ data: OcrPage }>;
}

/** One recognition pass → page text + flattened word geometry (bbox + confidence). */
async function recognizePass(
  worker: OcrWorker,
  blob: Blob,
  psm: string,
): Promise<{ text: string; words: ScanWord[] }> {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await worker.recognize(blob, undefined, { blocks: true, text: true });
  return { text: data.text ?? '', words: flattenWords(data.blocks) };
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const processImage = useCallback(async (file: Blob) => {
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
      const { createWorker, PSM } = await import('tesseract.js');
      worker = await createWorker('eng', 1, {
        workerPath: '/tesseract-worker.min.js',
        corePath: '/tesseract-core',
        langPath: '/tessdata',
        logger: ({ status }: { status: string; progress: number }) => {
          if (status === 'recognizing text') setPhase('Leyendo precio…');
        },
      });
      // Restrict recognition to price characters — drastically cuts the letter↔digit
      // confusion (e.g. "S"→"5", "O"→"0", "l"→"1") that wrecks free-form OCR on tags.
      // The DPI hint stops Tesseract guessing scale and improves digit segmentation.
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.,$ ',
        user_defined_dpi: '300',
      });

      // Pass 1 — treat the shot as a single block (clean price stickers).
      const pass1 = await recognizePass(worker, compressed, PSM.SINGLE_BLOCK);
      let words = pass1.words;
      let text = pass1.text;
      let summary = summarize(buildCandidates(words));

      // Pass 2 — only when unsure: sparse text (shelf tags with scattered numbers).
      // Merge the geometry of both passes so the biggest digits still win.
      if (summary.quality !== 'strong') {
        const pass2 = await recognizePass(worker, compressed, PSM.SPARSE_TEXT);
        words = [...words, ...pass2.words];
        text = `${text}\n${pass2.text}`;
        summary = summarize(buildCandidates(words));
      }

      if (summary.prices.length > 0) {
        // Candidates ranked biggest/most-confident first; pre-select the winner.
        setCandidates(summary.prices.slice(0, 8));
        setQuality(summary.quality);
        setHasDigits(true);
        setSelected(summary.autoSelect);
      } else {
        // No geometry (older worker) or nothing numeric — fall back to text regex.
        const fb = extractPrices(text);
        setCandidates([...fb.prices]);
        setQuality(fb.quality);
        setHasDigits(fb.hasDigits);
        setSelected(fb.quality === 'strong' ? fb.prices[0] ?? null : null);
      }
      setState('preview');
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo leer el precio.');
      setState('error');
    } finally {
      await (worker as { terminate: () => Promise<void> } | null)?.terminate().catch(() => null);
    }
  }, []);

  // Native file/camera input — used as a fallback when the live camera is
  // unavailable, and for picking an existing photo from the gallery.
  const openFile = useCallback((useCapture: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCapture) input.capture = 'environment';
    input.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void processImage(file);
    });
    input.click();
  }, [processImage]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Live camera with an on-screen ROI guide. Falls back to the native input
  // when getUserMedia is unsupported or the permission is denied.
  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    setSelected(null);
    setManual('');
    if (!navigator.mediaDevices?.getUserMedia) { openFile(true); return; }
    setState('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => undefined); }
    } catch {
      stopCamera();
      setState('idle');
      openFile(true);
    }
  }, [openFile, stopCamera]);

  const capturePhoto = useCallback(async () => {
    const v = videoRef.current;
    const f = frameRef.current;
    if (!v || !f) return;
    const rect = f.getBoundingClientRect();
    const blob = await cropRoiToBlob(v, rect.width, rect.height);
    stopCamera();
    if (blob) { void processImage(blob); }
    else { setErrorMsg('No se pudo capturar la imagen.'); setState('error'); }
  }, [processImage, stopCamera]);

  // Release the camera when the modal unmounts.
  useEffect(() => () => { stopCamera(); }, [stopCamera]);

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
    stopCamera();
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
              onClick={startCamera}
              className="w-full py-3.5 rounded-2xl bg-market-600 hover:bg-market-700 text-white font-bold text-base transition active:scale-[0.97] shadow-md shadow-market-500/20"
            >
              📷 Abrir cámara
            </button>
            <button
              type="button"
              onClick={() => openFile(false)}
              className="w-full py-2.5 rounded-2xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition"
            >
              📁 Subir una foto
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

        {/* live camera with ROI guide */}
        {state === 'camera' && (
          <div className="space-y-3">
            <div ref={frameRef} className="relative w-full h-72 bg-black rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {/* ROI frame + darkened surround so only the price band is highlighted */}
              <div
                className="absolute rounded-xl border-2 border-white/90 pointer-events-none"
                style={{ top: '34%', bottom: '34%', left: '6%', right: '6%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
              />
              <p className="absolute inset-x-0 top-3 text-center text-white text-xs font-medium drop-shadow">
                Encuadra el precio dentro del recuadro
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { stopCamera(); setState('idle'); }}
                className="py-3 px-4 rounded-2xl border border-stone-200 text-stone-600 font-semibold text-sm hover:bg-stone-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                className="flex-1 py-3 rounded-2xl bg-market-600 hover:bg-market-700 text-white font-bold text-base transition active:scale-[0.97] shadow-md shadow-market-500/20"
              >
                📸 Capturar precio
              </button>
            </div>
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
              <button type="button" onClick={startCamera} className="flex-1 py-2.5 rounded-xl bg-market-600 text-white font-semibold text-sm transition">
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
                onClick={startCamera}
                aria-label="Escanear de nuevo"
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
