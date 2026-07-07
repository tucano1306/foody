'use client';

import { useEffect, useState } from 'react';
import { playSound, setSoundsEnabled, soundsEnabled } from '@/lib/sound';

export default function SoundToggle() {
  // Assume ON for SSR; sync with the stored preference after mount.
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundsEnabled()), []);

  function toggle() {
    const next = !on;
    setOn(next);
    setSoundsEnabled(next);
    if (next) playSound('pop');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? 'Silenciar sonidos' : 'Activar sonidos'}
      title={on ? 'Silenciar sonidos' : 'Activar sonidos'}
      className="w-9 h-9 flex items-center justify-center rounded-full text-lg bg-white/70 dark:bg-white/10 shadow-sm hover:bg-white dark:hover:bg-white/20 transition"
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}
