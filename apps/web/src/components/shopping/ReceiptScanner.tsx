'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseReceiptText } from '@/lib/receipt-parser';
import type { ReceiptParseResult } from '@/lib/receipt-parser';
export type { ReceiptParseResult } from '@/lib/receipt-parser';

/**
 * Resize + preprocess image for OCR:
 * 1. Scales to ≤ maxPx on longest side and ≤ 1.2 MP total (prevents WASM OOM on mobile)
 * 2. Converts to greyscale
 * 3. Boosts contrast so faint receipt ink becomes dark against white background
 * These steps dramatically reduce OCR misreads (e.g. "3" → "n", "0" → "o").
 */
function compressImageFile(file: File, maxPx = 1400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      // ── 1. Scale ──────────────────────────────────────────────────────────
      const scaleByDim = Math.min(1, maxPx / Math.max(img.width, img.height));
      const MAX_PIXELS = 1_200_000;
      const scaleByPixels = Math.sqrt(MAX_PIXELS / (img.width * img.height));
      const scale = Math.min(scaleByDim, scaleByPixels, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }

      ctx.drawImage(img, 0, 0, w, h);

      // ── 2. Greyscale + contrast boost via pixel manipulation ───────────────
      const imageData = ctx.getImageData(0, 0, w, h);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        // Luminosity greyscale
        const grey = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        // Contrast stretch: push darks down and lights up (factor 1.6, pivot 128)
        const contrasted = Math.min(255, Math.max(0, Math.round(1.6 * (grey - 128) + 128)));
        d[i] = contrasted;
        d[i + 1] = contrasted;
        d[i + 2] = contrasted;
        // alpha (d[i+3]) unchanged
      }
      ctx.putImageData(imageData, 0, 0);

      // ── 3. Export as PNG to preserve sharp edges (better than JPEG for text)
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('Error al comprimir la imagen')); },
        'image/png',
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
    img.src = url;
  });
}

// ─── Live camera quality analysis ───────────────────────────────────────────

interface FrameQuality {
  sharpness: number;    // Laplacian variance — higher = sharper
  brightness: number;  // 0-255 mean luminance
  edgeDensity: number; // fraction of pixels with strong edges (0-1)
}

type QualityLevel = 'poor' | 'fair' | 'good';

function analyzeFrame(imageData: ImageData): FrameQuality {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  let brightnessSum = 0;
  for (let i = 0; i < width * height; i++) {
    const v = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    gray[i] = v;
    brightnessSum += v;
  }
  const brightness = brightnessSum / gray.length;

  let lapSum = 0, lapSum2 = 0, edgeCount = 0, count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const lap =
        gray[(y - 1) * width + x] +
        gray[y * width + (x - 1)] +
        gray[y * width + (x + 1)] +
        gray[(y + 1) * width + x] -
        4 * gray[y * width + x];
      lapSum += lap;
      lapSum2 += lap * lap;
      if (Math.abs(lap) > 30) edgeCount++;
      count++;
    }
  }
  const lapMean = lapSum / count;
  const sharpness = lapSum2 / count - lapMean * lapMean;
  const edgeDensity = edgeCount / count;
  return { sharpness, brightness, edgeDensity };
}

function getQualityFeedback(q: FrameQuality): { level: QualityLevel; label: string; hint: string } {
  if (q.brightness < 50) {
    return { level: 'poor', label: 'Muy oscuro', hint: 'Enciende la linterna del teléfono' };
  }
  if (q.edgeDensity < 0.03 && q.sharpness < 25) {
    return { level: 'poor', label: 'Demasiado lejos', hint: 'Acércate hasta que el recibo llene la pantalla' };
  }
  if (q.edgeDensity > 0.48) {
    return { level: 'fair', label: 'Demasiado cerca', hint: 'Aléjate un poco para capturar todo el recibo' };
  }
  if (q.sharpness < 25) {
    return { level: 'poor', label: 'Muy borroso', hint: 'Aleja el teléfono lentamente y mantén quieto' };
  }
  if (q.edgeDensity < 0.04) {
    return { level: 'fair', label: 'Muy lejos', hint: 'Acércate un poco más al recibo' };
  }
  if (q.sharpness < 70) {
    return { level: 'fair', label: 'Casi listo', hint: 'Mantén el teléfono quieto un momento…' };
  }
  if (q.brightness < 80) {
    return { level: 'fair', label: 'Poco luminoso', hint: 'Activa la linterna para mejor resultado' };
  }
  return { level: 'good', label: '¡Listo para capturar!', hint: 'Toca el botón Capturar' };
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim().length > 0) return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const raw = (err as { message: unknown }).message;
    if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  }
  return 'No se pudo inicializar el lector. Verifica tu conexión a internet e inténtalo de nuevo.';
}

interface Props {
  readonly onResult: (data: ReceiptParseResult) => void;
  readonly onClose: () => void;
}

type ScanState = 'idle' | 'processing' | 'done' | 'error';

const PHASE_LABELS: Record<string, string> = {
  'loading tesseract core': 'Cargando motor de lectura…',
  'initializing tesseract': 'Inicializando…',
  'initializing api': 'Inicializando…',
  'loading language traineddata': 'Cargando modelo de idioma…',
  'initialized tesseract': 'Motor listo…',
  'initialized api': 'Motor listo…',
  'recognizing text': 'Analizando texto…',
};

function getStatusText(state: ScanState, phase: string): string {
  if (state === 'processing') return phase.length > 0 ? phase : 'Preparando lector…';
  if (state === 'done') return 'Listo';
  if (state === 'error') return 'No se pudo leer el recibo';
  return '';
}

export default function ReceiptScanner({ onResult, onClose }: Props) {
  const [state, setState] = useState<ScanState>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [phase, setPhase] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Live camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [quality, setQuality] = useState<FrameQuality | null>(null);

  // Stop stream on unmount
  useEffect(() => () => {
    if (analysisRef.current !== null) clearInterval(analysisRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const processImage = useCallback(
    async (file: File) => {
      abortRef.current = false;
      setState('processing');
      setErrorMsg(null);
      setProgressPct(0);
      setPhase('');

      // Show preview
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);

      // Tesseract worker instance — kept outside try so finally can terminate it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let worker: any = null;

      // Hard timeout: if nothing finishes in 2 min, surface an error
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Tiempo de espera agotado. Comprueba tu conexión e inténtalo de nuevo.')),
          120_000,
        );
      });

      try {
        // Compress image to prevent WebAssembly OOM on mobile
        const compressed = await compressImageFile(file);

        // Dynamically import Tesseract to avoid SSR / initial bundle bloat
        const { createWorker } = await import('tesseract.js');

        // Race createWorker against the hard timeout
        worker = await Promise.race([
          createWorker('eng', 1, {
            // All assets served from same origin → no cross-origin importScripts failures
            workerPath: '/tesseract-worker.min.js',
            corePath: '/tesseract-core',
            langPath: '/tessdata',
            logger: (m: { status: string; progress: number }) => {
              if (abortRef.current) return;
              const label = PHASE_LABELS[m.status] ?? m.status;
              setPhase(label);
              setProgressPct(Math.round(m.progress * 100));
            },
            // NOTE: no errorHandler — let errors propagate to the catch block
          }),
          timeoutPromise,
        ]);

        if (abortRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const { data: { text } } = await Promise.race([
          worker.recognize(compressed),
          timeoutPromise,
        ]);

        if (abortRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const parsed = parseReceiptText(text);
        setState('done');
        onResult(parsed);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        setErrorMsg(extractErrorMessage(err));
        setState('error');
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        await worker?.terminate().catch(() => null);
      }
    },
    [onResult],
  );

  function handleClose() {
    abortRef.current = true;
    stopCamera();
    onClose();
  }

  function stopCamera() {
    if (analysisRef.current !== null) { clearInterval(analysisRef.current); analysisRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setQuality(null);
    setCameraOpen(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Attach stream after state update (video element renders)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
      analysisRef.current = setInterval(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        const W = 320;
        const H = Math.round(W * video.videoHeight / (video.videoWidth || 1));
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, W, H);
        setQuality(analyzeFrame(ctx.getImageData(0, 0, W, H)));
      }, 400);
    } catch {
      // getUserMedia failed (denied or not supported) \u2014 fall back to native file picker
      openFilePicker('environment');
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      void processImage(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.95);
  }

  function openFilePicker(capture?: 'environment') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = capture;
    input.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (file) void processImage(file);
    });
    input.click();
  }

  const isProcessing = state === 'processing';
  const statusText = getStatusText(state, phase);

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex flex-col bg-black/90 m-0 p-0 max-w-none max-h-none w-full h-full border-none"
      aria-label="Receipt scanner"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3">
        <h2 className="text-white font-semibold text-base">📄 Escanear recibo</h2>
        <button
          type="button"
          onClick={handleClose}
          className="text-white/70 hover:text-white text-2xl leading-none"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        {/* Preview */}
        {preview ? (
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden border-2 border-brand-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Vista previa del recibo"
              className={`w-full object-contain max-h-64 ${isProcessing ? 'opacity-60' : ''}`}
            />
            {isProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
                <svg
                  className="animate-spin h-8 w-8 text-brand-300"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                {progressPct > 0 && (
                  <span className="text-white text-sm font-semibold">{progressPct}%</span>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Placeholder */
          <div className="w-full max-w-sm rounded-2xl border-2 border-dashed border-white/30 flex flex-col items-center justify-center gap-2 h-52 text-white/40">
            <span className="text-5xl">🧾</span>
            <p className="text-sm">La imagen del recibo aparecerá aquí</p>
          </div>
        )}

        {/* Status */}
        {statusText.length > 0 && (
          <p
            className={`text-sm text-center font-medium ${
              state === 'error' ? 'text-red-400' : 'text-white/80'
            }`}
          >
            {statusText}
          </p>
        )}

        {/* Progress bar */}
        {isProcessing && (
          <div className="w-full max-w-sm h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-brand-400 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Action buttons (visible when idle or error) */}
        {!isProcessing && state !== 'done' && (
          <div className="flex flex-col gap-3 w-full max-w-xs">
            {/* Camera capture (mobile) */}
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 text-white px-5 py-3.5 font-semibold text-sm shadow-lg hover:bg-brand-700 transition"
            >
              <span aria-hidden="true">📷</span> Tomar foto del recibo
            </button>
            {/* File upload */}
            <button
              type="button"
              onClick={() => openFilePicker()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 text-white px-5 py-3.5 font-semibold text-sm hover:bg-white/20 transition"
            >
              <span aria-hidden="true">🖼️</span> Elegir imagen de galería
            </button>

            {/* Torch tip — prominent callout */}
            <div className="flex items-start gap-2.5 rounded-xl bg-yellow-400/15 border border-yellow-400/30 px-3.5 py-2.5">
              <span className="text-lg leading-none mt-0.5" aria-hidden="true">🔦</span>
              <p className="text-xs text-yellow-200 leading-relaxed">
                <strong className="font-semibold">Enciende la linterna antes de tomar la foto.</strong>
                {' '}Los recibos se leen mucho mejor con buena iluminación.
              </p>
            </div>

            {state === 'error' && errorMsg && (
              <p className="text-xs text-red-400 text-center">{errorMsg}</p>
            )}
          </div>
        )}

        {state === 'done' && (
          <p className="text-green-400 font-semibold text-sm text-center">
            ✅ Recibo procesado — revisa los productos detectados
          </p>
        )}
      </div>

      {/* ── Live camera overlay ──────────────────────────────── */}
      {cameraOpen && <CameraOverlay
        videoRef={videoRef}
        quality={quality}
        onCapture={captureFrame}
        onCancel={stopCamera}
      />}

    </dialog>
  );
}

// \u2500\u2500\u2500 CameraOverlay \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface CameraOverlayProps {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly quality: FrameQuality | null;
  readonly onCapture: () => void;
  readonly onCancel: () => void;
}

const LEVEL_BORDER: Record<QualityLevel, string> = {
  poor: 'border-red-400',
  fair: 'border-yellow-400',
  good: 'border-green-400',
};
const LEVEL_BADGE: Record<QualityLevel, string> = {
  poor: 'bg-red-500/90 text-white',
  fair: 'bg-yellow-400/90 text-black',
  good: 'bg-green-500/90 text-white',
};
const LEVEL_BTN: Record<QualityLevel, string> = {
  poor: 'bg-white/20 text-white/50 cursor-not-allowed',
  fair: 'bg-yellow-400 text-black hover:bg-yellow-300',
  good: 'bg-green-500 text-white hover:bg-green-400',
};

function CameraOverlay({ videoRef, quality, onCapture, onCancel }: CameraOverlayProps) {
  const feedback = quality ? getQualityFeedback(quality) : null;
  const level: QualityLevel = feedback?.level ?? 'poor';
  const canCapture = level === 'good' || level === 'fair';

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      {/* Live video feed */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dim vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 45%, transparent 50%, rgba(0,0,0,.55) 100%)' }} />

      {/* Viewfinder frame */}
      <div className={`absolute inset-x-8 top-[15%] bottom-[28%] rounded-2xl border-2 ${LEVEL_BORDER[level]} transition-colors duration-300`}>
        {/* Corner guides */}
        {['top-0 left-0 border-t-4 border-l-4', 'top-0 right-0 border-t-4 border-r-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((cls) => (
          <div key={cls} className={`absolute w-6 h-6 rounded-sm ${LEVEL_BORDER[level]} ${cls}`} />
        ))}
      </div>

      {/* Quality badge */}
      <div className="absolute inset-x-0 bottom-[27%] flex flex-col items-center gap-1.5 px-8">
        {feedback && (
          <span className={`px-3 py-1 rounded-full text-sm font-semibold shadow ${LEVEL_BADGE[level]}`}>
            {feedback.label}
          </span>
        )}
        {feedback && (
          <p className="text-xs text-white/80 text-center leading-tight">{feedback.hint}</p>
        )}
        {!feedback && (
          <p className="text-xs text-white/50 text-center">Analizando imagen\u2026</p>
        )}
      </div>

      {/* Buttons */}
      <div className="absolute bottom-8 inset-x-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-2xl bg-white/10 text-white px-5 py-3.5 font-semibold text-sm hover:bg-white/20 transition"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onCapture}
          disabled={!canCapture}
          className={`flex-[2] rounded-2xl px-5 py-3.5 font-semibold text-sm transition shadow-lg ${LEVEL_BTN[level]}`}
        >
          {level === 'good' ? '📸 Capturar' : '⏳ Capturar'}
        </button>
      </div>
    </div>
  );
}
