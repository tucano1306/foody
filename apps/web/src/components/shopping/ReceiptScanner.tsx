'use client';

import { useCallback, useRef, useState } from 'react';
import { parseReceiptText } from '@/lib/receipt-parser';
import type { ReceiptParseResult } from '@/lib/receipt-parser';
export type { ReceiptParseResult } from '@/lib/receipt-parser';

interface Props {
  readonly onResult: (data: ReceiptParseResult) => void;
  readonly onClose: () => void;
}

type ScanState = 'idle' | 'processing' | 'done' | 'error';

function getStatusText(state: ScanState): string {
  if (state === 'processing') return 'Leyendo recibo… puede tardar unos segundos';
  if (state === 'done') return 'Listo';
  if (state === 'error') return 'No se pudo leer el recibo';
  return '';
}

export default function ReceiptScanner({ onResult, onClose }: Props) {
  const [state, setState] = useState<ScanState>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const processImage = useCallback(
    async (file: File) => {
      abortRef.current = false;
      setState('processing');
      setErrorMsg(null);
      setProgressPct(0);

      // Show preview
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);

      try {
        // Dynamically import Tesseract to avoid SSR / initial bundle bloat
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              setProgressPct(Math.round(m.progress * 100));
            }
          },
        });

        if (abortRef.current) {
          await worker.terminate();
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();

        if (abortRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        const parsed = parseReceiptText(text);
        setState('done');
        onResult(parsed);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        setErrorMsg(err instanceof Error ? err.message : 'Error desconocido');
        setState('error');
      }
    },
    [onResult],
  );

  function handleClose() {
    abortRef.current = true;
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void processImage(file);
  }

  const isProcessing = state === 'processing';
  const statusText = getStatusText(state);

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
        {isProcessing && progressPct > 0 && (
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
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 text-white px-5 py-3.5 font-semibold text-sm shadow-lg hover:bg-brand-700 transition"
            >
              <span aria-hidden="true">📷</span> Tomar foto del recibo
            </button>
            {/* File upload */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 text-white px-5 py-3.5 font-semibold text-sm hover:bg-white/20 transition"
            >
              <span aria-hidden="true">🖼️</span> Elegir imagen de galería
            </button>

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

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChange}
      />
    </dialog>
  );
}
