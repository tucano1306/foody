'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import ModalLayer from '@/components/ui/ModalLayer';
import {
  cameraErrorMessage,
  coverSourceRect,
  fitWithin,
  PRODUCT_PHOTO_MAX,
  PRODUCT_PHOTO_QUALITY,
} from '@/lib/photo-capture';

interface Props {
  /** La foto ya recortada a lo encuadrado y reducida a la medida final (JPEG). */
  readonly onCapture: (photo: Blob) => void;
  readonly onClose: () => void;
  /**
   * Abre el selector de la galería. Se llama dentro del toque del usuario: si
   * se llamara después de un `await`, el navegador bloquearía el selector.
   */
  readonly onGallery: () => void;
  /**
   * La cámara del sistema, la de antes. Solo como salida cuando la de la
   * página no arranca (permiso denegado, cámara ocupada): puede volver a
   * chocar con la falta de memoria, pero es mejor que no tener cámara.
   */
  readonly onSystemCamera: () => void;
}

type Estado = 'abriendo' | 'lista' | 'disparando' | 'error';

const RESTRICCIONES: MediaStreamConstraints = {
  audio: false,
  // 1280×720 sobra para una foto final de 512 px y ocupa poca memoria.
  // `ideal` y no `exact`: un portátil sin cámara trasera usa la que tenga.
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

/** El fotograma visible, recortado como en el visor y ya a 512 px. */
function fotogramaAJpeg(video: HTMLVideoElement): Promise<Blob | null> {
  const caja = video.getBoundingClientRect();
  const src = coverSourceRect(video.videoWidth, video.videoHeight, caja.width, caja.height);
  if (!src) return Promise.resolve(null);
  const { w, h } = fitWithin(Math.round(src.sw), Math.round(src.sh), PRODUCT_PHOTO_MAX);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, src.sx, src.sy, src.sw, src.sh, 0, 0, w, h);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        // Suelta los píxeles del lienzo ya, sin esperar al recolector.
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob);
      },
      'image/jpeg',
      PRODUCT_PHOTO_QUALITY,
    );
  });
}

/**
 * Cámara a pantalla completa DENTRO de la página, para la foto del producto.
 * Ver `lib/photo-capture.ts`: la cámara del sistema hacía que Android cerrara
 * Chrome y la foto se perdía con «falta de memoria».
 */
export default function ProductCamera({ onCapture, onClose, onGallery, onSystemCamera }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Un doble toque en el disparador no puede sacar (ni subir) dos fotos. */
  const disparandoRef = useRef(false);
  const [estado, setEstado] = useState<Estado>('abriendo');
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const apagar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelado = false;

    navigator.mediaDevices.getUserMedia(RESTRICCIONES).then(
      (stream) => {
        // Se cerró mientras el navegador pedía permiso: la cámara no puede
        // quedarse encendida sin nadie mirando.
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        for (const track of stream.getVideoTracks()) {
          // Android quita la cámara a la página si otra app la reclama (una
          // videollamada, la app de cámara). `stop()` propio no dispara esto.
          track.addEventListener('ended', () => {
            if (cancelado || streamRef.current !== stream) return;
            apagar();
            setError('La cámara se cerró.');
            setEstado('error');
          });
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // autoPlay ya lo arranca; play() cubre a los navegadores que lo
        // ignoran con srcObject. Si lo rechaza, autoPlay sigue ahí.
        void video.play()?.catch(() => undefined);
      },
      (err: unknown) => {
        if (cancelado) return;
        setError(cameraErrorMessage(err));
        setEstado('error');
      },
    );

    return () => {
      cancelado = true;
      apagar();
    };
  }, [intento, apagar]);

  // Escape cierra, como cualquier otra hoja de la app (en el portátil).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function reintentar() {
    setError(null);
    setEstado('abriendo');
    setIntento((i) => i + 1);
  }

  async function disparar() {
    const video = videoRef.current;
    if (!video || estado !== 'lista' || disparandoRef.current) return;
    disparandoRef.current = true;
    setEstado('disparando');
    try {
      const foto = await fotogramaAJpeg(video);
      if (!foto) {
        setError('No se pudo tomar la foto.');
        setEstado('error');
        apagar();
        return;
      }
      apagar();
      onCapture(foto);
    } finally {
      disparandoRef.current = false;
    }
  }

  return (
    <ModalLayer>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cámara"
        className="fixed inset-0 z-50 flex flex-col bg-black"
      >
        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            playsInline
            muted
            // `loadeddata` = ya hay un fotograma que dibujar. Antes de eso
            // el disparador sacaría una foto negra.
            onLoadedData={() => setEstado((e) => (e === 'abriendo' ? 'lista' : e))}
          />

          {(estado === 'abriendo' || estado === 'disparando') && (
            <div className="absolute inset-0 flex items-center justify-center" aria-live="polite">
              <div
                className="w-10 h-10 rounded-full border-4 border-brand-400/40 border-t-brand-400 animate-spin"
                aria-label={estado === 'abriendo' ? 'Abriendo cámara' : 'Guardando foto'}
              />
            </div>
          )}

          {estado === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6">
              <p role="alert" className="text-white text-sm font-semibold text-center">
                {error ?? 'No se pudo abrir la cámara.'}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={reintentar}
                  className="px-5 py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm transition active:scale-95"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={onGallery}
                  className="px-5 py-3 rounded-xl bg-white/20 text-white font-semibold text-sm transition active:scale-95"
                >
                  🖼️ Galería
                </button>
              </div>
              <button
                type="button"
                onClick={onSystemCamera}
                className="px-5 py-2.5 text-white/70 font-medium text-sm transition hover:text-white"
              >
                📸 Cámara del teléfono
              </button>
            </div>
          )}

          {/* El último a propósito: así se pinta ENCIMA de las capas de carga y
              de error, que tapan toda la caja. Antes de ellas quedaba debajo y
              no había forma de salir mientras se pedía permiso o tras un fallo. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar cámara"
            className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center transition active:scale-95"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-10 bg-black pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onGallery}
            aria-label="Elegir de la galería"
            className="w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center transition active:scale-95"
          >
            <PhotoIcon className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => void disparar()}
            disabled={estado !== 'lista'}
            aria-label="Tomar foto"
            className="w-18 h-18 rounded-full border-4 border-white bg-white/30 transition active:scale-95 disabled:opacity-40"
          />
          {/* Contrapeso del botón de galería: el disparador queda centrado. */}
          <span className="w-12 h-12" aria-hidden />
        </div>
      </div>
    </ModalLayer>
  );
}
