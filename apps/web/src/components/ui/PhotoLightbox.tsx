'use client';

import { useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
}

function getDist(t: React.TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

function getMidpoint(t: React.TouchList) {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
}

export default function PhotoLightbox({ src, alt, onClose }: Props) {
  const imgRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    scale: 1,
    x: 0,
    y: 0,
    lastTap: 0,
    // touch tracking
    initDist: 0,
    initScale: 1,
    initX: 0,
    initY: 0,
    startX: 0,
    startY: 0,
    dragging: false,
  });

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const applyTransform = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const { scale, x, y } = stateRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }, []);

  function resetZoom() {
    const s = stateRef.current;
    s.scale = 1; s.x = 0; s.y = 0;
    applyTransform();
  }

  function handleTouchStart(e: React.TouchEvent) {
    const s = stateRef.current;
    if (e.touches.length === 2) {
      s.initDist = getDist(e.touches);
      s.initScale = s.scale;
      const mid = getMidpoint(e.touches);
      s.initX = mid.x; s.initY = mid.y;
    } else if (e.touches.length === 1) {
      s.startX = e.touches[0].clientX - s.x;
      s.startY = e.touches[0].clientY - s.y;
      s.dragging = true;
      // double tap
      const now = Date.now();
      if (now - s.lastTap < 280) {
        if (s.scale > 1) { resetZoom(); } else { s.scale = 3; applyTransform(); }
        s.lastTap = 0;
      } else {
        s.lastTap = now;
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const s = stateRef.current;
    if (e.touches.length === 2) {
      const dist = getDist(e.touches);
      const newScale = Math.min(8, Math.max(1, s.initScale * (dist / s.initDist)));
      s.scale = newScale;
      applyTransform();
    } else if (e.touches.length === 1 && s.dragging && s.scale > 1) {
      s.x = e.touches[0].clientX - s.startX;
      s.y = e.touches[0].clientY - s.startY;
      applyTransform();
    }
  }

  function handleTouchEnd() {
    stateRef.current.dragging = false;
    if (stateRef.current.scale < 1.05) resetZoom();
  }

  return (
    <dialog
      open
      aria-label={`Foto de ${alt}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 w-full h-full max-w-none max-h-none m-0 p-0 border-0"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar lightbox"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-transparent border-0 cursor-default"
      />

      {/* Close */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl transition-colors"
      >
        ✕
      </button>

      {/* Reset zoom button */}
      <button
        type="button"
        aria-label="Restablecer zoom"
        onClick={resetZoom}
        className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-base transition-colors"
      >
        ⤡
      </button>

      {/* Image container */}
      <div
        className="relative z-10 w-full h-full flex items-center justify-center overflow-hidden touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={imgRef}
          className="relative w-full max-w-screen-sm"
          style={{ aspectRatio: '1 / 1', transformOrigin: 'center center', transition: 'transform 0.05s linear', willChange: 'transform' }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            className="object-contain select-none"
            sizes="100vw"
            priority
            draggable={false}
          />
        </div>
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs pointer-events-none z-10 whitespace-nowrap">
        Pellizca para zoom · Doble tap para ampliar
      </p>
    </dialog>
  );
}
