'use client';

import { useEffect, useState } from 'react';

const FOOD_EMOJIS = ['🍎', '🥑', '🍞', '🥕', '🧀', '🍇', '🍋', '🥦', '🍓', '🍌', '🥐', '🍅'];

interface Particle {
  readonly emoji: string;
  readonly left: number; // vw
  readonly size: number; // px
  readonly duration: number; // s
  readonly delay: number; // s
}

/**
 * Decorative game-like backdrop: drifting gradient blobs + food emojis
 * floating up the screen. Sits behind the page content, never captures
 * pointer events, and freezes under prefers-reduced-motion.
 */
export default function FunBackground() {
  // Particles are randomized, so generate them after mount to keep SSR markup stable.
  const [particles, setParticles] = useState<readonly Particle[] | null>(null);

  useEffect(() => {
    setParticles(
      FOOD_EMOJIS.map((emoji, i) => ({
        emoji,
        left: (i * 8.3 + Math.random() * 6) % 100,
        size: 18 + Math.random() * 16,
        duration: 22 + Math.random() * 18,
        // Negative delay = already mid-flight on load, no empty-sky start
        delay: -Math.random() * 30,
      })),
    );
  }, []);

  return (
    <div aria-hidden="true" className="fun-bg">
      <div className="fun-blob fun-blob-1" />
      <div className="fun-blob fun-blob-2" />
      <div className="fun-blob fun-blob-3" />
      {particles?.map((p) => (
        <span
          key={p.emoji}
          className="fun-emoji"
          style={{
            left: `${p.left}vw`,
            fontSize: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
