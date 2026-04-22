'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  readonly onDetected: (code: string) => void;
  readonly onClose: () => void;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
];

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);

  useEffect(() => {
    const Detector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;

    if (!Detector) {
      setSupported(false);
      setError('Tu navegador no soporta escaneo nativo. Prueba en Chrome/Edge móvil.');
      return;
    }

    const detector = new Detector({ formats: FORMATS });
    const state = { cancelled: false };

    function scheduleNext(d: BarcodeDetectorLike) {
      rafRef.current = requestAnimationFrame(() => runDetection(d));
    }

    function handleCodes(codes: Array<{ rawValue: string }>, d: BarcodeDetectorLike) {
      const value = codes[0]?.rawValue;
      if (value) {
        onDetected(value);
        return;
      }
      scheduleNext(d);
    }

    function runDetection(d: BarcodeDetectorLike) {
      if (state.cancelled || !videoRef.current) return;
      d.detect(videoRef.current)
        .then((codes) => handleCodes(codes, d))
        .catch(() => scheduleNext(d));
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (state.cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        runDetection(detector);
      } catch (e) {
        setError((e as Error).message || 'No se pudo abrir la cámara');
      }
    }

    start();

    return () => {
      state.cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-semibold">Escanear código de barras</span>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="text-2xl w-10 h-10 rounded-full hover:bg-white/10"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {supported ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-12 border-2 border-white/60 rounded-2xl pointer-events-none" />
            <div className="absolute bottom-10 left-0 right-0 text-center text-white/80 text-sm px-6">
              Apunta al código de barras del producto
            </div>
          </>
        ) : (
          <div className="text-center text-white p-6">
            <p className="text-4xl mb-3">📷</p>
            <p>{error}</p>
          </div>
        )}
      </div>

      {error && supported && (
        <div className="p-4 text-center text-rose-200 text-sm">{error}</div>
      )}
    </div>
  );
}
