'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
}

export default function PhotoLightbox({ src, alt, onClose }: Props) {
  const [zoomed, setZoomed] = useState(false);
  const lastTap = useRef(0);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleImageTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // double tap → toggle zoom
      setZoomed((z) => !z);
    }
    lastTap.current = now;
  }

  return (
    <dialog
      open
      aria-label={`Foto de ${alt}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm w-full h-full max-w-none max-h-none m-0 p-0 border-0"
    >
      {/* Backdrop — clicking it closes */}
      <button
        type="button"
        aria-label="Cerrar lightbox"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-transparent border-0 cursor-default"
      />

      {/* Close button */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl transition-colors"
      >
        ✕
      </button>

      {/* Image zoom button */}
      <button
        type="button"
        aria-label={zoomed ? 'Reducir zoom' : 'Ampliar imagen'}
        onClick={handleImageTap}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleImageTap(); }}
        className={`relative z-10 max-w-screen-sm w-full m-4 transition-transform duration-300 ease-out bg-transparent border-0 ${
          zoomed ? 'scale-[2] cursor-zoom-out' : 'scale-100 cursor-zoom-in'
        }`}
        style={{ aspectRatio: '1 / 1' }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain rounded-xl select-none"
          sizes="100vw"
          priority
          draggable={false}
        />
      </button>

      {/* Hint */}
      {!zoomed && (
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-xs pointer-events-none z-10">
          Doble tap para zoom
        </p>
      )}
    </dialog>
  );
}
