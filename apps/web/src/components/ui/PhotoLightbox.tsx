'use client';

/**
 * PhotoLightbox — Amazon-style photo viewer
 *
 * Desktop: hover magnifier (shows 3× zoom in a side panel, like Amazon)
 *          scroll-wheel for finer zoom, click-drag when zoomed
 * Mobile:  pinch-to-zoom, double-tap to zoom/reset, drag when zoomed
 *
 * Background: white, image centered on card — mimics Amazon product page
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import Image from 'next/image';

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
  readonly originRect?: DOMRect;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const LENS_SIZE = 120; // px — magnifier lens diameter
const LENS_ZOOM = 3;   // magnification factor shown in side panel

function getDist(touches: TouchList) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

export default function PhotoLightbox({ src, alt, onClose, originRect }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const imgRef        = useRef<HTMLDivElement>(null);
  const lensRef       = useRef<HTMLDivElement>(null);
  const panelRef      = useRef<HTMLDivElement>(null);

  // Gesture state — all mutable, no re-renders during gestures
  const s = useRef({
    scale: 1, x: 0, y: 0,
    lastTap: 0,
    initDist: 0, initScale: 1,
    startX: 0, startY: 0,
    dragging: false,
    mouseDown: false,
    mouseStartX: 0, mouseStartY: 0,
  });

  // Hover-magnifier state (desktop only)
  const [lensVisible, setLensVisible] = useState(false);
  const lensPos = useRef({ x: 0, y: 0 });
  const isMobile = useRef(false);

  useEffect(() => {
    isMobile.current = 'ontouchstart' in globalThis;
  }, []);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Lock body scroll ──────────────────────────────────────────────────────
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
    const el = imgRef.current;
    if (el) {
      el.style.transition = 'transform 0.2s ease';
      applyTransform();
      setTimeout(() => { el.style.transition = 'none'; }, 220);
    }
  }, [applyTransform]);

  // ── Hero entrance animation ───────────────────────────────────────────────
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !originRect) return;

    const naturalSize = Math.min(globalThis.innerWidth * 0.9, globalThis.innerHeight * 0.85);
    const heroScale = Math.min(originRect.width / naturalSize, originRect.height / naturalSize);
    const dx = (originRect.left + originRect.width / 2) - globalThis.innerWidth / 2;
    const dy = (originRect.top + originRect.height / 2) - globalThis.innerHeight / 2;

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${heroScale})`;
    el.style.opacity = '0.75';
    el.style.borderRadius = '12px';

    function clearTransition() { if (el) el.style.transition = 'none'; }
    function animateToCenter() {
      if (!el) return;
      el.style.transition = 'transform 0.36s cubic-bezier(0.34,1.38,0.64,1), opacity 0.2s ease, border-radius 0.28s ease';
      el.style.transform = 'translate(0,0) scale(1)';
      el.style.opacity = '1';
      el.style.borderRadius = '0px';
      setTimeout(clearTransition, 400);
    }
    requestAnimationFrame(() => requestAnimationFrame(animateToCenter));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Desktop hover magnifier ───────────────────────────────────────────────
  // Shows a circular lens on the image + zoomed view in a panel to the right
  function updateLens(clientX: number, clientY: number) {
    const imgEl = imgRef.current;
    const lens  = lensRef.current;
    const panel = panelRef.current;
    if (!imgEl || !lens || !panel || s.current.scale > 1) return;

    const rect = imgEl.getBoundingClientRect();
    const rx = clientX - rect.left;
    const ry = clientY - rect.top;

    // Keep lens fully inside the image
    const lx = Math.max(LENS_SIZE / 2, Math.min(rect.width  - LENS_SIZE / 2, rx));
    const ly = Math.max(LENS_SIZE / 2, Math.min(rect.height - LENS_SIZE / 2, ry));

    lensPos.current = { x: lx, y: ly };

    // Position lens circle
    lens.style.left = `${lx - LENS_SIZE / 2}px`;
    lens.style.top  = `${ly - LENS_SIZE / 2}px`;

    // Background-position for the magnified panel (percentage)
    const pctX = ((lx / rect.width)  * 100).toFixed(2);
    const pctY = ((ly / rect.height) * 100).toFixed(2);

    panel.style.backgroundImage    = `url("${src}")`;
    panel.style.backgroundSize     = `${rect.width * LENS_ZOOM}px ${rect.height * LENS_ZOOM}px`;
    panel.style.backgroundPosition = `${pctX}% ${pctY}%`;
    panel.style.backgroundRepeat   = 'no-repeat';
  }

  function handleImgMouseEnter() {
    if (isMobile.current || s.current.scale > 1) return;
    setLensVisible(true);
  }
  function handleImgMouseLeave() {
    setLensVisible(false);
  }
  function handleImgMouseMove(e: React.MouseEvent) {
    if (isMobile.current) return;
    if (!lensVisible) setLensVisible(true);
    updateLens(e.clientX, e.clientY);
  }

  // ── Touch gestures (passive:false for pinch prevention) ──────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      const st = s.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        st.initDist  = getDist(e.touches);
        st.initScale = st.scale;
      } else if (e.touches.length === 1) {
        st.startX   = e.touches[0].clientX - st.x;
        st.startY   = e.touches[0].clientY - st.y;
        st.dragging = true;
        const now = Date.now();
        if (now - st.lastTap < 300) {
          e.preventDefault();
          st.scale > 1 ? resetZoom() : (() => { st.scale = 3; st.x = 0; st.y = 0; applyTransform(); })();
          st.lastTap = 0;
        } else {
          st.lastTap = now;
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const st = s.current;
      if (e.touches.length === 2) {
        st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.initScale * (getDist(e.touches) / st.initDist)));
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
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [applyTransform, resetZoom]);

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────
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
      // Hide lens when manually zoomed
      if (st.scale > 1) setLensVisible(false);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyTransform]);

  // ── Mouse drag (desktop, when zoomed) ────────────────────────────────────
  function handleMouseDown(e: React.MouseEvent) {
    if (s.current.scale <= 1) return;
    s.current.mouseDown    = true;
    s.current.mouseStartX  = e.clientX - s.current.x;
    s.current.mouseStartY  = e.clientY - s.current.y;
    e.preventDefault();
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!s.current.mouseDown) return;
    s.current.x = e.clientX - s.current.mouseStartX;
    s.current.y = e.clientY - s.current.mouseStartY;
    applyTransform();
  }
  function handleMouseUp() { s.current.mouseDown = false; }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  // Panel visibility: show on right side if viewport wide enough
  const panelSide = globalThis.window !== undefined && globalThis.innerWidth >= 900;

  return (
    <dialog
      open
      aria-label={`Foto de ${alt}`}
      className="fixed inset-0 z-50 w-full h-full max-w-none max-h-none m-0 p-0 border-0 bg-white animate-[fadeIn_0.16s_ease-out]"
    >
      {/* ── Top bar (Amazon-style minimal) ─────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 border-b border-stone-100">
        <span className="text-stone-700 font-medium text-sm truncate max-w-[60%]">{alt}</span>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-stone-100 active:bg-stone-200 text-stone-500 text-lg transition-colors"
        >
          ✕
        </button>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="absolute inset-0 top-13 flex items-stretch">
        {/* Image zone */}
        <div
          ref={containerRef}
          aria-hidden="true"
          className="flex-1 flex items-center justify-center overflow-hidden select-none bg-white"
          onClick={handleBackdropClick}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={(e) => { handleMouseUp(); handleImgMouseLeave(); }}
          style={{ cursor: s.current.scale > 1 ? 'grab' : 'default' }}
        >
          {/* Image wrapper — relative so the lens can be positioned inside */}
          <div
            aria-hidden="true"
            style={{ position: 'relative', display: 'inline-block' }}
            onMouseEnter={handleImgMouseEnter}
            onMouseLeave={handleImgMouseLeave}
            onMouseMove={handleImgMouseMove}
          >
            <div
              ref={imgRef}
              style={{
                width:  'min(80vw, 70vh)',
                height: 'min(80vw, 70vh)',
                position: 'relative',
                transformOrigin: 'center center',
                willChange: 'transform',
                animation: originRect ? undefined : 'photoIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              {src.startsWith('data:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none' }} draggable={false} />
              ) : (
                <Image src={src} alt={alt} fill className="object-contain select-none" sizes="80vw" priority draggable={false} />
              )}
            </div>

            {/* Amazon-style circular lens overlay */}
            {lensVisible && s.current.scale <= 1 && !panelSide && (
              <div
                ref={lensRef}
                style={{
                  position: 'absolute',
                  width:  LENS_SIZE,
                  height: LENS_SIZE,
                  border: '2px solid #c8a951',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  background: 'rgba(200,169,81,0.12)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
                  zIndex: 10,
                  top: 0, left: 0,
                }}
              />
            )}
            {/* Crosshair lens for side-panel mode */}
            {lensVisible && s.current.scale <= 1 && panelSide && (
              <div
                ref={lensRef}
                style={{
                  position: 'absolute',
                  width:  LENS_SIZE,
                  height: LENS_SIZE,
                  border: '2px solid #c8a951',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  background: 'rgba(200,169,81,0.10)',
                  zIndex: 10,
                  top: 0, left: 0,
                }}
              />
            )}
          </div>
        </div>

        {/* ── Amazon side zoom panel (desktop ≥ 900 px wide) ─────────── */}
        {panelSide && (
          <div
            className="hidden sm:flex items-center justify-center"
            style={{ width: 380, borderLeft: '1px solid #e5e7eb', background: '#fff' }}
          >
            {lensVisible && s.current.scale <= 1 ? (
              <div
                ref={panelRef}
                style={{
                  width:  360,
                  height: 360,
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
                aria-hidden="true"
              />
            ) : (
              <p className="text-stone-300 text-sm text-center px-6">
                Pasa el cursor sobre la imagen para ver el detalle
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Inline zoom panel for narrow screens ───────────────────────── */}
      {!panelSide && lensVisible && s.current.scale <= 1 && (
        <div
          className="sm:hidden absolute bottom-0 inset-x-0 z-20 border-t border-stone-100"
          style={{ height: 180 }}
        >
          <div
            ref={panelRef}
            style={{ width: '100%', height: '100%' }}
            aria-hidden="true"
          />
        </div>
      )}

      {/* ── Hint (mobile only) ──────────────────────────────────────────── */}
      <p className="sm:hidden absolute bottom-2 left-1/2 -translate-x-1/2 text-stone-300 text-[11px] pointer-events-none whitespace-nowrap z-10">
        Doble tap · Pellizca para zoom
      </p>
    </dialog>
  );
}
