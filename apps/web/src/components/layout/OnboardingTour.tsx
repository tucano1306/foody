'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'foody-onboarding-done';

const STEPS = [
  {
    emoji: '🥑',
    title: '¡Bienvenido a Foody!',
    text: 'Controla tu despensa y tu lista de compras sin esfuerzo. Te mostramos lo esencial en 30 segundos.',
  },
  {
    emoji: '🏠',
    title: 'Modo Casa',
    text: 'Marca cada producto como ✅ tengo, ⚠️ a la mitad o 🚨 se acabó. Los que necesitas entran automáticamente en tu lista del súper.',
  },
  {
    emoji: '🛒',
    title: 'Modo Supermercado',
    text: 'En la tienda, toca cada producto para marcarlo como comprado. Al terminar, presiona Finalizar y todo vuelve a "Tengo".',
  },
];

export default function OnboardingTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (globalThis.window === undefined) return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setStep(0);
  }, []);

  function next() {
    if (step === null) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finish();
    }
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1');
    setStep(null);
  }

  if (step === null) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 w-full h-full max-w-none max-h-none m-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-fade-up">
        <div className="text-center">
          <div className="text-6xl mb-3">{current.emoji}</div>
          <h2 id="onboarding-title" className="text-xl font-bold text-stone-800 mb-2">
            {current.title}
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed">{current.text}</p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-5">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-brand-500' : 'w-1.5 bg-stone-200'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={finish}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-stone-100 transition"
          >
            Saltar
          </button>
          <button
            onClick={next}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white transition"
          >
            {isLast ? '¡Empezar!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
