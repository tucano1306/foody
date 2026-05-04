'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface BarcodeScanResult {
  readonly name: string;
  readonly category: string;
  readonly photoUrl: string | null;
}

interface Props {
  readonly onResult: (data: BarcodeScanResult) => void;
  readonly onClose: () => void;
}

type ScanState = 'starting' | 'scanning' | 'detecting' | 'not-found' | 'error';

export default function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  // Keep latest onResult in a ref so the scanner effect doesn't need it as dependency
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const [scanState, setScanState] = useState<ScanState>('starting');
  const [scanKey, setScanKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const detectedRef = useRef(false);

  const handleBarcode = useCallback(async (code: string) => {
    setScanState('detecting');
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as {
        found: boolean;
        name?: string;
        category?: string;
        photoUrl?: string | null;
      };

      if (data.found) {
        onResultRef.current({
          name: data.name ?? '',
          category: data.category ?? '',
          photoUrl: data.photoUrl ?? null,
        });
      } else {
        setScanState('not-found');
        detectedRef.current = false;
      }
    } catch {
      setScanState('error');
      setErrorMsg('Sin conexión. Verifica tu red.');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    detectedRef.current = false;
    setScanState('starting');
    setErrorMsg(null);

    async function start() {
      try {
        const { BrowserMultiFormatReader, BrowserCodeReader } = await import('@zxing/browser');

        if (!mounted || !videoRef.current) return;

        const devices = await BrowserCodeReader.listVideoInputDevices();
        // Prefer back/rear/environment camera on mobile devices
        const backCamera = devices.find((d) => /back|rear|environment/i.test(d.label));
        const deviceId = backCamera?.deviceId ?? undefined;

        const codeReader = new BrowserMultiFormatReader();
        const controls = await codeReader.decodeFromVideoDevice(
          deviceId ?? null,
          videoRef.current,
          (result) => {
            if (!result || detectedRef.current) return;
            detectedRef.current = true;
            controlsRef.current?.stop();
            void handleBarcode(result.getText());
          },
        );

        if (mounted) {
          controlsRef.current = controls;
          setScanState('scanning');
        } else {
          controls.stop();
        }
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        setErrorMsg(
          msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')
            ? 'Permite el acceso a la cámara en tu navegador'
            : 'No se pudo iniciar la cámara',
        );
        setScanState('error');
      }
    }

    void start();

    return () => {
      mounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [scanKey, handleBarcode]);

  function retry() {
    setScanKey((k) => k + 1);
  }

  function getOverlayMsg(state: ScanState): string | null {
    if (state === 'starting') return 'Iniciando cámara...';
    if (state === 'detecting') return 'Buscando producto...';
    if (state === 'not-found') return 'Producto no encontrado en la base de datos';
    if (state === 'error') return errorMsg ?? 'Error de cámara';
    return null;
  }

  const overlayMsg = getOverlayMsg(scanState);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-white text-sm font-semibold">Escanear código de barras</p>
        <button
          type="button"
          aria-label="Cerrar escáner"
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

        {/* Scan frame + animated line */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-64 h-36 overflow-hidden">
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-brand-400 rounded-tl" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-brand-400 rounded-tr" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-brand-400 rounded-bl" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-brand-400 rounded-br" />
              {/* Scanning line */}
              <div className="absolute left-2 right-2 h-0.5 bg-brand-400/90 shadow-[0_0_6px_2px_var(--color-brand-400)] animate-scan-line" />
            </div>
            <p className="mt-5 text-white/80 text-xs font-medium tracking-wide">
              Apunta al código de barras del producto
            </p>
          </div>
        )}

        {/* State overlays */}
        {overlayMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 px-6">
            {scanState === 'starting' && (
              <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin mb-4" />
            )}
            {scanState === 'detecting' && (
              <div className="w-10 h-10 rounded-full border-4 border-brand-400/40 border-t-brand-400 animate-spin mb-4" />
            )}
            {scanState === 'not-found' && <p className="text-4xl mb-3">🔍</p>}
            {scanState === 'error' && <p className="text-4xl mb-3">📵</p>}

            <p className="text-white text-sm font-semibold text-center leading-snug">
              {overlayMsg}
            </p>

            {(scanState === 'not-found' || scanState === 'error') && (
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={retry}
                  className="px-5 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm transition hover:bg-brand-600"
                >
                  Intentar de nuevo
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-white/20 text-white font-semibold text-sm transition hover:bg-white/30"
                >
                  Cancelar
                </button>
              </div>
            )}

            {scanState === 'not-found' && (
              <p className="mt-3 text-white/50 text-xs text-center">
                Puedes escribir el nombre manualmente
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
