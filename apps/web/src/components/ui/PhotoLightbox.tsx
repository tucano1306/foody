'use client';

import { useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

function getDist(touches: TouchList) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

export default function PhotoLightbox({ src, alt, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // All mutable state lives in a ref to avoid re-renders during gestures
  const s = useRef({
    scale: 1, x: 0, y: 0,
    // touch
    lastTap: 0,
    initDist: 0, initScale: 1,
    startX: 0, startY: 0,
    dragging: false,
    // mouse
    mouseDown: false,
    mouseStartX: 0, mouseStartY: 0,
  });

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
    el.style.transform = `translate(${s.current.x}px, ${s.current.y}px) scale(${s.current.scale})`;
  }, []);

  const resetZoom = useCallback(() => {
    s.current.scale = 1; s.current.x = 0; s.current.y = 0;
    const elRef = imgRef.current;
    if (elRef) {
      elRef.style.transition = 'transform 0.2s ease';
      applyTransform();
      setTimeout(() => { elRef.style.transition = 'none'; }, 200);
    }
  }, [applyTransform]);

  // ── Attach touch events with passive:false so preventDefault() works ──────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const st = s.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        st.initDist = getDist(e.touches);
        st.initScale = st.scale;
      } else if (e.touches.length === 1) {
        st.startX = e.touches[0].clientX - st.x;
        st.startY = e.touches[0].clientY - st.y;
        st.dragging = true;
        // double tap to zoom
        const now = Date.now();
        if (now - st.lastTap < 300) {
          e.preventDefault();
          if (st.scale > 1) {
            resetZoom();
          } else {
            st.scale = 3; st.x = 0; st.y = 0;
            applyTransform();
          }
          st.lastTap = 0;
        } else {
          st.lastTap = now;
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault(); // blocks browser native scroll/pinch — only works with passive:false
      const st = s.current;
      if (e.touches.length === 2) {
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.initScale * (getDist(e.touches) / st.initDist)));
        st.scale = newScale;
        applyTransform();
      } else if (e.touches.length === 1 && st.dragging && st.scale > 1) {
        st.x = e.touches[0].clientX - st.startX;
        st.y = e.touches[0].clientY - st.startY;
        applyTransform();
      }
    }

    function onTouchEnd() {
      s.current.dragging = false;
      if (s.current.scale < 1.05) resetZoom();
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [applyTransform, resetZoom]);

  // ── Mouse wheel zoom (desktop/trackpad) ──────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const st = s.current;
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.scale * delta));
      if (st.scale <= MIN_SCALE) { st.x = 0; st.y = 0; }
      applyTransform();
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyTransform]);

  // ── Mouse drag (desktop) ─────────────────────────────────────────────────
  function handleMouseDown(e: React.MouseEvent) {
    if (s.current.scale <= 1) return;
    s.current.mouseDown = true;
    s.current.mouseStartX = e.clientX - s.current.x;
    s.current.mouseStartY = e.clientY - s.current.y;
    e.preventDefault();
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!s.current.mouseDown) return;
    s.current.x = e.clientX - s.current.mouseStartX;
    s.current.y = e.clientY - s.current.mouseStartY;
    applyTransform();
  }
  function handleMouseUp() { s.current.mouseDown = false; }

  // Close only on backdrop click (not image)
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <dialog
      open
      aria-label={`Foto de ${alt}`}
      className="fixed inset-0 z-50 bg-black/95 w-full h-full max-w-none max-h-none m-0 p-0 border-0"
    >
      {/* Close button */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl transition-colors"
      >
        ✕
      </button>

      {/* Reset zoom */}
      {/* biome-ignore lint */}
      <button
        type="button"
        aria-label="Restablecer zoom"
        onClick={resetZoom}
        className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-base transition-colors"
      >
        ⤡
      </button>

      {/* Gesture area — fills screen, click on empty space to close */}
      <div
        ref={containerRef}
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center overflow-hidden select-none"
        style={{ cursor: s.current.scale > 1 ? 'grab' : 'zoom-in' }}
        onClick={handleBackdropClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={imgRef}
          className="relative"
          style={{
            width: 'min(90vw, 90vh)',
            height: 'min(90vw, 90vh)',
            transformOrigin: 'center center',
            transition: 'none',
            willChange: 'transform',
          }}
        >
          {src.startsWith('data:') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt} className="w-full h-full object-contain select-none" draggable={false} />
          ) : (
            <Image
              src={src}
              alt={alt}
              fill
              className="object-contain select-none"
              sizes="90vw"
              priority
              draggable={false}
            />
          )}
        </div>
      </div>

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 text-xs pointer-events-none z-10 whitespace-nowrap">
        Pellizca o rueda del ratón para zoom · Doble tap para ampliar
      </p>
    </dialog>
  );
}
