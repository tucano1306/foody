'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product } from '@foody/types';
import { haptic } from '@/lib/haptic';

interface Props {
  readonly products: readonly Product[];
}

interface Command {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly emoji: string;
  readonly run: () => void;
}

export default function CommandPalette({ products }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    globalThis.window.addEventListener('keydown', onKey);
    return () => globalThis.window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const navCommands: Command[] = [
    { id: 'nav-home', emoji: '🏠', label: 'Ir a Casa', run: () => router.push('/home') },
    { id: 'nav-super', emoji: '🛒', label: 'Ir al Súper', run: () => router.push('/supermarket') },
    { id: 'nav-products', emoji: '🥑', label: 'Ver productos', run: () => router.push('/products') },
    { id: 'nav-new-product', emoji: '➕', label: 'Agregar producto', hint: 'Nuevo', run: () => router.push('/products/new') },
    { id: 'nav-payments', emoji: '💳', label: 'Ver pagos', run: () => router.push('/payments') },
    { id: 'nav-household', emoji: '🏡', label: 'Mi hogar', run: () => router.push('/household') },
  ];

  const productCommands: Command[] = products.slice(0, 50).map((p) => ({
    id: `p-${p.id}`,
    emoji: '📦',
    label: p.name,
    hint: p.category ?? undefined,
    run: () => router.push(`/products/${p.id}`),
  }));

  const all = [...navCommands, ...productCommands];
  const q = query.trim().toLowerCase();
  const filtered = q === ''
    ? navCommands
    : all.filter((c) => c.label.toLowerCase().includes(q) || (c.hint?.toLowerCase().includes(q) ?? false));

  function execute(c: Command) {
    haptic(10);
    c.run();
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[index]) {
      e.preventDefault();
      execute(filtered[index]);
    }
  }

  function startVoice() {
    type SpeechRecognitionInstance = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      maxAlternatives: number;
      start(): void;
      stop(): void;
      onstart: (() => void) | null;
      onresult:
        | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
        | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
    const w = globalThis.window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      globalThis.window.alert('Tu navegador no soporta reconocimiento de voz');
      return;
    }
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setListening(true);
      haptic(20);
    };
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const text = e.results[0][0].transcript;
      setQuery(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el || !open) return;
    function handleClick(e: MouseEvent) {
      if (e.target === el) setOpen(false);
    }
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      aria-label="Búsqueda rápida"
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <section className="fixed inset-x-0 top-20 mx-auto w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
          <span className="text-stone-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={handleKey}
            placeholder="Busca productos, acciones o navega..."
            className="flex-1 bg-transparent outline-none text-stone-800 placeholder-stone-300"
          />
          <button
            type="button"
            onClick={startVoice}
            aria-label="Buscar por voz"
            className={`px-2 py-1 rounded-lg text-lg transition ${
              listening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'text-stone-400 hover:bg-stone-100'
            }`}
          >
            🎤
          </button>
          <kbd className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded">
            ESC
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-stone-400">
              Sin resultados para "{query}"
            </li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => execute(c)}
                onMouseEnter={() => setIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                  i === index ? 'bg-brand-50 text-brand-700' : 'text-stone-700'
                }`}
              >
                <span className="text-lg">{c.emoji}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint && (
                  <span className="text-[11px] text-stone-400 truncate max-w-[40%]">{c.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <footer className="px-4 py-2 border-t border-stone-100 text-[11px] text-stone-400 flex justify-between">
          <span>
            <kbd className="px-1 bg-stone-100 rounded">↑↓</kbd> navegar · <kbd className="px-1 bg-stone-100 rounded">⏎</kbd> elegir
          </span>
          <span>
            <kbd className="px-1 bg-stone-100 rounded">⌘K</kbd>
          </span>
        </footer>
      </section>
    </dialog>
  );
}
