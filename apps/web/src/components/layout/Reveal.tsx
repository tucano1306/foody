'use client';

import { useEffect, useRef, useState } from 'react';

/** Wraps a page zone so it slides+fades in when scrolled into view.
 * Uses a rect check on scroll/resize (not IntersectionObserver): some
 * embedded webviews never deliver IO callbacks, which would leave the
 * section permanently invisible. */
export default function Reveal({ children, className = '' }: { readonly children: React.ReactNode; readonly className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let done = false;
    const check = () => {
      if (done) return;
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      // Reveal once the section's top enters the lower 92% of the viewport
      // (or is already above it, e.g. after an anchor jump)
      if (rect.top < viewport * 0.92) {
        done = true;
        setVisible(true);
        window.removeEventListener('scroll', check);
        window.removeEventListener('resize', check);
      }
    };

    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  return (
    <div ref={ref} className={`reveal-section ${visible ? 'reveal-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}
