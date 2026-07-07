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

export default function GreetingToast({ firstName }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const hour = new Date().getHours();
  const greeting = getGreeting(hour);
  const emoji = getGreetingEmoji(hour);
  const text = firstName ? `${greeting}, ${firstName}! ${emoji}` : `${greeting}! ${emoji}`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.95 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="flex items-center gap-2.5 bg-brand-600/95 backdrop-blur-sm border border-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-2xl shadow-lg whitespace-nowrap">
            {text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
