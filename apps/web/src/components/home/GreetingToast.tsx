'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  readonly firstName: string | null;
}

function getGreeting(h: number): string {
  if (h >= 5 && h < 12) return '¡Buenos días';
  if (h >= 12 && h < 19) return '¡Buenas tardes';
  return '¡Buenas noches';
}

function getGreetingEmoji(h: number): string {
  if (h >= 5 && h < 12) return '🌅';
  if (h >= 12 && h < 19) return '☀️';
  return '🌙';
}

/** One playful phrase per day — feels alive without being random on every visit. */
const DAILY_PHRASES = [
  '🔥 ¡A darle al día!',
  '🥑 Tu despensa te espera',
  '⭐ Hoy todo bajo control',
  '🛒 ¿Listo para el súper?',
  '💪 ¡Vamos con todo hoy!',
  '🏆 Cada pago al día suma',
  '✨ Pequeños hábitos, gran hogar',
] as const;

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

const SPARKLES = [
  { emoji: '✨', x: -14, y: -10, delay: 0.35 },
  { emoji: '⭐', x: 105, y: -14, delay: 0.55 },
  { emoji: '✨', x: 112, y: 60, delay: 0.75 },
  { emoji: '💫', x: -18, y: 55, delay: 0.95 },
] as const;

export default function GreetingToast({ firstName }: Props) {
  // Render only after mount: all the content depends on the client clock.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  const now = new Date();
  const hour = now.getHours();
  const greeting = getGreeting(hour);
  const emoji = getGreetingEmoji(hour);
  const phrase = DAILY_PHRASES[dayOfYear(now) % DAILY_PHRASES.length];

  // Inline banner: lives in the page flow (never overlaps the title) and
  // collapses smoothly when it dismisses itself.
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="relative">
            {/* Sparkles popping around the card */}
            {SPARKLES.map((s) => (
              <motion.span
                key={`${s.x}-${s.y}`}
                aria-hidden="true"
                className="absolute text-sm z-10"
                style={{ left: `${Math.min(Math.max(s.x, 2), 96)}%`, top: `${Math.min(Math.max(s.y, 5), 80)}%` }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0, 1.3, 0], rotate: [0, 40] }}
                transition={{ duration: 1.1, delay: s.delay, ease: 'easeOut' }}
              >
                {s.emoji}
              </motion.span>
            ))}

            {/* Animated gradient banner — sky/navy, same family as Modo Casa */}
            <motion.div
              className="flex items-center gap-3 text-white px-4 sm:px-5 py-3 rounded-2xl shadow-md border border-white/20"
              style={{
                backgroundImage: 'linear-gradient(115deg, #0284c7, #0e7490, #1e40af, #0284c7)',
                backgroundSize: '300% 300%',
              }}
              animate={{ backgroundPosition: ['0% 50%', '100% 50%'] }}
              transition={{ duration: 4, ease: 'linear' }}
            >
              {/* Waving hand */}
              <motion.span
                aria-hidden="true"
                className="text-2xl origin-[70%_80%] shrink-0"
                animate={{ rotate: [0, 22, -12, 22, -8, 0] }}
                transition={{ duration: 1.4, delay: 0.3, ease: 'easeInOut' }}
              >
                👋
              </motion.span>

              <div className="leading-tight min-w-0">
                <p className="text-sm font-extrabold truncate">
                  {greeting}{firstName ? `, ${firstName}` : ''}! {emoji}
                </p>
                <motion.p
                  className="text-[11px] text-white/85 font-medium truncate"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                >
                  {phrase}
                </motion.p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
