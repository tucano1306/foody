'use client';

/**
 * PhotoLightbox — Amazon-style photo viewer
 *
 * Desktop: hover magnifier lens + side zoom panel (≥ 900 px wide)
 *          — all imperative DOM updates, zero React state changes during hover
 *            so Next.js Image never re-renders / flickers
 * Mobile:  pinch-to-zoom, double-tap to zoom/reset, drag when zoomed
 *
 * Background: white, image centered — mimics Amazon product page
 */

import { useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
  readonly originRect?: DOMRect;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const LENS_SIZE = 120;
const LENS_ZOOM = 3;

function getDist(touches: TouchList) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

export default function PhotoLightbox({ src, alt, onClose, originRect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLDivElement>(null);
  const imgWrapRef   = useRef<HTMLDivElement>(null);
  const lensRef      = useRef<HTMLDivElement>(null);
  const panelRef     = useRef<HTMLDivElement>(null);
  const sidePanelEl  = useRef<HTMLDivElement>(null);

  // Computed once on mount — no state, no re-render
  const isMobile  = useRef(false);
  const panelSide = useRef(false);

  const s = useRef({
    scale: 1, x: 0, y: 0,
    lastTap: 0,
    initDist: 0, initScale: 1,
    startX: 0, startY: 0,
    dragging: false,
    mouseDown: false,
    mouseStartX: 0, mouseStartY: 0,
  });

  useEffect(() => {
    isMobile.current  = 'ontouchstart' in globalThis;
    panelSide.current = globalThis.innerWidth >= 900;
    if (sidePanelEl.current) {
      sidePanelEl.current.style.display = panelSide.current ? 'flex' : 'none';
    }
    if (lensRef.current) {
      lensRef.current.style.borderRadius = panelSide.current ? '4px' : '50%';
    }
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

  // ── Hero entrance ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !originRect) return;
    const naturalSize = Math.min(globalThis.innerWidth * 0.9, globalThis.innerHeight * 0.85);
    const heroScale = Math.min(originRect.width / naturalSize, originRect.height / naturalSize);
    const dx = (originRect.left + originRect.width / 2) - globalThis.innerWidth / 2;
    const dy = (originRect.top  + originRect.height / 2) - globalThis.innerHeight / 2;
    el.style.transition = 'none';
    el.style.transform  = `translate(${dx}px, ${dy}px) scale(${heroScale})`;
    el.style.opacity    = '0.75';
    el.style.borderRadius = '12px';
    function clear() { if (el) el.style.transition = 'none'; }
    function animate() {
      if (!el) return;
      el.style.transition   = 'transform 0.36s cubic-bezier(0.34,1.38,0.64,1), opacity 0.2s ease, border-radius 0.28s ease';
      el.style.transform    = 'translate(0,0) scale(1)';
      el.style.opacity      = '1';
      el.style.borderRadius = '0px';
      setTimeout(clear, 400);
    }
    requestAnimationFrame(() => requestAnimationFrame(animate));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Imperative lens helpers — NO useState, zero re-renders ──────────────
  const hideLens = useCallback(() => {
    const lens = lensRef.current;
    if (lens) lens.style.display = 'none';
    const panel = panelRef.current;
    if (panel) panel.style.opacity = '0';
  }, []);

  const updateLens = useCallback((clientX: number, clientY: number) => {
    if (isMobile.current || s.current.scale > 1) return;
    const imgWrap = imgWrapRef.current;
    const lens    = lensRef.current;
    const panel   = panelRef.current;
    if (!imgWrap || !lens) return;

    const rect = imgWrap.getBoundingClientRect();
    const rx = clientX - rect.left;
    const ry = clientY - rect.top;
    if (rx < 0 || ry < 0 || rx > rect.width || ry > rect.height) { hideLens(); return; }

    const lx = Math.max(LENS_SIZE / 2, Math.min(rect.width  - LENS_SIZE / 2, rx));
    const ly = Math.max(LENS_SIZE / 2, Math.min(rect.height - LENS_SIZE / 2, ry));

    lens.style.display = 'block';
    lens.style.left    = `${lx - LENS_SIZE / 2}px`;
    lens.style.top     = `${ly - LENS_SIZE / 2}px`;

    if (panel) {
      const pctX = ((lx / rect.width)  * 100).toFixed(2);
      const pctY = ((ly / rect.height) * 100).toFixed(2);
      panel.style.backgroundImage    = `url("${src}")`;
      panel.style.backgroundSize     = `${rect.width * LENS_ZOOM}px ${rect.height * LENS_ZOOM}px`;
      panel.style.backgroundPosition = `${pctX}% ${pctY}%`;
      panel.style.backgroundRepeat   = 'no-repeat';
      panel.style.opacity            = '1';
    }
  }, [src, hideLens]);

  // ── Touch gestures ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onTouchStart(e: TouchEvent) {
      const st = s.current;
      if (e.touches.length === 2) {
        e.preventDefault();
        st.initDist = getDist(e.touches); st.initScale = st.scale;
      } else if (e.touches.length === 1) {
        st.startX = e.touches[0].clientX - st.x;
        st.startY = e.touches[0].clientY - st.y;
        st.dragging = true;
        const now = Date.now();
        if (now - st.lastTap < 300) {
          e.preventDefault();
          st.scale > 1 ? resetZoom() : (() => { st.scale = 3; st.x = 0; st.y = 0; applyTransform(); })();
          st.lastTap = 0;
        } else { st.lastTap = now; }
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

  // ── Mouse events — all imperative, zero React synthetic events ───────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onMouseMove(e: MouseEvent) {
      if (s.current.mouseDown) {
        // drag
        s.current.x = e.clientX - s.current.mouseStartX;
        s.current.y = e.clientY - s.current.mouseStartY;
        applyTransform();
      } else {
        updateLens(e.clientX, e.clientY);
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (s.current.scale <= 1) return;
      s.current.mouseDown   = true;
      s.current.mouseStartX = e.clientX - s.current.x;
      s.current.mouseStartY = e.clientY - s.current.y;
      e.preventDefault();
    }
    function onMouseUp() { s.current.mouseDown = false; }
    function onMouseLeave() { s.current.mouseDown = false; hideLens(); }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const st = s.current;
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      st.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.scale * delta));
      if (st.scale <= MIN_SCALE) { st.x = 0; st.y = 0; }
      applyTransform();
      if (st.scale > 1) hideLens();
    }
    function onClick(e: MouseEvent) {
      if (e.target === container) onClose();
    }

    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mousedown',  onMouseDown);
    container.addEventListener('mouseup',    onMouseUp);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('wheel',      onWheel, { passive: false });
    container.addEventListener('click',      onClick);
    return () => {
      container.removeEventListener('mousemove',  onMouseMove);
      container.removeEventListener('mousedown',  onMouseDown);
      container.removeEventListener('mouseup',    onMouseUp);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('wheel',      onWheel);
      container.removeEventListener('click',      onClick);
    };
  }, [applyTransform, hideLens, updateLens, onClose]);

  return (
    <dialog
      open
      aria-label={`Foto de ${alt}`}
      className="fixed inset-0 z-50 w-full h-full max-w-none max-h-none m-0 p-0 border-0 bg-white animate-[fadeIn_0.16s_ease-out]"
    >
      {/* ── Top bar — desktop only ───────────────────────────────────────── */}
      <div className="hidden sm:flex absolute top-0 inset-x-0 z-20 items-center justify-between px-4 py-3 border-b border-stone-100">
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

      {/* ── Mobile close button — floating, no bar ───────────────────────── */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="sm:hidden absolute top-3 right-3 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-black/35 text-white text-lg backdrop-blur-sm"
      >
        ✕
      </button>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      {/* Mobile: inset-0 (fullscreen). Desktop: top-13 (below bar) */}
      <div className="absolute inset-0 sm:top-13 flex items-stretch">

        {/* Image zone — all interactions via imperative addEventListener */}
        <div
          ref={containerRef}
          aria-hidden="true"
          className="flex-1 flex items-center justify-center overflow-hidden select-none bg-white"
        >
          {/* Inner wrapper — sized to image, needed for lens coordinate math */}
          <div
            ref={imgWrapRef}
            aria-hidden="true"
            style={{ position: 'relative', display: 'inline-block' }}
          >
            {/* Image */}
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

            {/* Lens — shown/hidden imperatively */}
            <div
              ref={lensRef}
              style={{
                display: 'none',
                position: 'absolute',
                width:  LENS_SIZE,
                height: LENS_SIZE,
                border: '2px solid #c8a951',
                borderRadius: '50%',
                pointerEvents: 'none',
                background: 'rgba(200,169,81,0.08)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                zIndex: 10,
                top: 0, left: 0,
              }}
            />
          </div>
        </div>

        {/* ── Side zoom panel — shown only on wide screens ─────────────── */}
        <div
          ref={sidePanelEl}
          style={{
            display: 'none',
            width: 380,
            borderLeft: '1px solid #e5e7eb',
            background: '#fff',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <div
            ref={panelRef}
            style={{
              width: 356,
              height: 356,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              overflow: 'hidden',
              opacity: 0,
              transition: 'opacity 0.12s ease',
            }}
            aria-hidden="true"
          />
          <p style={{ color: '#c8c8c8', fontSize: 12, textAlign: 'center', padding: '0 24px' }}>
            Pasa el cursor sobre la imagen
          </p>
        </div>
      </div>

      {/* ── Mobile hint ──────────────────────────────────────────────────── */}
      <p className="sm:hidden absolute bottom-2 left-1/2 -translate-x-1/2 text-white/50 text-[11px] pointer-events-none whitespace-nowrap z-10">
        Doble tap · Pellizca para zoom
      </p>
    </dialog>
  );
}
