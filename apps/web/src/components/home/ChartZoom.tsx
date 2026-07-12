'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface Props {
  readonly title: string;
  readonly children: React.ReactNode;
}

/**
 * Corner "expand" button + fullscreen overlay for a stats card.
 *
 * On a phone held upright (portrait) the overlay rotates the panel 90° so the
 * chart fills the screen in landscape and reads bigger; in landscape or on
 * desktop it simply fills the viewport. The parent card must be `relative`
 * for the corner button to anchor.
 */
export default function ChartZoom({ title, children }: Props) {
  const [open, setOpen] = useState(false);

  // Lock body scroll + close with Escape while the overlay is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    globalThis.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      globalThis.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ampliar ${title}`}
        title="Ampliar"
        className="absolute top-3.5 right-3.5 z-10 w-8 h-8 rounded-lg bg-stone-100 dark:bg-white/10 text-stone-500 dark:text-stone-300 flex items-center justify-center hover:bg-stone-200 dark:hover:bg-white/20 active:scale-95 transition"
      >
        <ArrowsPointingOutIcon className="w-4 h-4" />
      </button>

      {/* The chart as it lives inside the card */}
      {children}

      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-white dark:bg-stone-900 overflow-hidden">
          {/* Portrait phones: rotate the panel 90° to use the screen in landscape.
              Tailwind v4 composes translate → rotate, so the box is centered
              first and then turned around its own center. */}
          <div className="w-full h-full flex flex-col portrait:fixed portrait:top-1/2 portrait:left-1/2 portrait:w-[100dvh] portrait:h-[100dvw] portrait:-translate-x-1/2 portrait:-translate-y-1/2 portrait:rotate-90">
            <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 shrink-0">
              <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100 truncate">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-stone-100 dark:bg-white/10 text-stone-600 dark:text-stone-300 flex items-center justify-center hover:bg-stone-200 dark:hover:bg-white/20 active:scale-95 transition shrink-0"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </header>
            {/* zoom > 1 enlarges the whole chart (all are fluid DOM/SVG) */}
            <div className="flex-1 min-h-0 overflow-auto px-5 pb-6" style={{ zoom: 1.25 }}>
              {children}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
