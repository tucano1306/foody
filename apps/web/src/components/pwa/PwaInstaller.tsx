'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function registerWorker(): void {
  navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch(() => null);
}

export default function PwaInstaller() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (globalThis.window === undefined) return;
    if (!('serviceWorker' in navigator)) return;

    // Register worker after load to avoid blocking hydration
    const onLoad = () => registerWorker();
    if (document.readyState === 'complete') onLoad();
    else globalThis.addEventListener('load', onLoad, { once: true });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      const dismissed = localStorage.getItem('foody-install-dismissed');
      if (!dismissed) setVisible(true);
    };
    globalThis.addEventListener('beforeinstallprompt', onPrompt);

    return () => {
      globalThis.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }

  function dismiss() {
    localStorage.setItem('foody-install-dismissed', '1');
    setVisible(false);
  }

  if (!visible || !deferred) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 md:left-auto md:right-4 md:w-80 z-50 bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-100 p-4 animate-fade-up">
      <div className="flex items-start gap-3">
        <span className="text-3xl">🥑</span>
        <div className="flex-1">
          <p className="font-bold text-stone-800 text-sm">Instala Foody</p>
          <p className="text-xs text-stone-500 mt-0.5">
            Accede rápido desde tu pantalla de inicio y úsalo sin conexión.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={install}
              className="flex-1 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2 rounded-xl transition"
            >
              Instalar
            </button>
            <button
              onClick={dismiss}
              className="px-3 text-sm text-stone-500 hover:text-stone-700 transition"
            >
              Después
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
