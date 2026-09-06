'use client';

import { useEffect, useRef, useState, type ElementType } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  CreditCardIcon,
  CubeIcon,
  BuildingOfficeIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MicrophoneIcon,
  PlusIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline';
import type { PaletteProduct } from '@/lib/api';
import { haptic } from '@/lib/haptic';
import { OPEN_PALETTE_EVENT } from './command-palette-bus';

interface Props {
  readonly products: readonly PaletteProduct[];
}

interface Command {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon: ElementType;
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

  // Los botones de lupa (cabecera del móvil y barra lateral) abren por evento:
  // ⌘K no existe en un teléfono y esta pantalla era inalcanzable allí.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    globalThis.window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => globalThis.window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const navCommands: Command[] = [
    { id: 'nav-home', icon: HomeIcon, label: 'Ir a Casa', run: () => router.push('/home') },
    { id: 'nav-super', icon: ShoppingCartIcon, label: 'Ir al Súper', run: () => router.push('/supermarket') },
    { id: 'nav-products', icon: CubeIcon, label: 'Ver productos', run: () => router.push('/products') },
    { id: 'nav-new-product', icon: PlusIcon, label: 'Agregar producto', hint: 'Nuevo', run: () => router.push('/products/new') },
    { id: 'nav-payments', icon: CreditCardIcon, label: 'Ver pagos', run: () => router.push('/payments') },
    { id: 'nav-household', icon: BuildingOfficeIcon, label: 'Mi hogar', run: () => router.push('/household') },
  ];

  const productCommands: Command[] = products.slice(0, 50).map((p) => ({
    id: `p-${p.id}`,
    icon: CubeIcon,
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
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <section className="fixed inset-x-4 top-6 sm:top-24 mx-auto w-auto sm:w-full sm:max-w-xl bg-[var(--surface)] rounded-[var(--radius-sheet)] shadow-[var(--shadow-lg)] overflow-hidden animate-fade-up">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--line)]">
          <MagnifyingGlassIcon className="w-5 h-5 shrink-0 text-[var(--ink-subtle)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={handleKey}
            placeholder="Busca un producto o una sección"
            /* 16px exactos: por debajo de eso, Safari en iOS hace zoom al
               enfocar el campo y descoloca toda la pantalla. */
            className="flex-1 min-w-0 h-11 bg-transparent outline-none text-base text-[var(--ink)] placeholder:text-[var(--ink-subtle)]"
          />
          <button
            type="button"
            onClick={startVoice}
            aria-label="Buscar por voz"
            aria-pressed={listening}
            className={`grid place-items-center w-10 h-10 shrink-0 rounded-full touch-auto-size ${
              listening
                ? 'bg-[var(--accent)] text-white animate-pulse'
                : 'text-[var(--ink-subtle)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <MicrophoneIcon className="w-5 h-5" />
          </button>
        </div>

        <ul className="max-h-[55vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <li className="px-4 py-10 text-center">
              <p className="text-[var(--ink-muted)] font-medium">Nada con «{query}»</p>
            </li>
          )}
          {filtered.map((c, i) => {
            const Icon = c.icon;
            const highlighted = i === index;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => execute(c)}
                  onMouseEnter={() => setIndex(i)}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-2xl text-left ${
                    highlighted ? 'bg-[var(--accent-soft)]' : ''
                  }`}
                >
                  <span
                    className={`grid place-items-center w-10 h-10 shrink-0 rounded-xl ${
                      highlighted ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        highlighted ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]'
                      }`}
                    />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={`block truncate font-semibold ${
                        highlighted ? 'text-[var(--accent)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {c.label}
                    </span>
                    {c.hint && <span className="block t-meta truncate">{c.hint}</span>}
                  </span>
                  {highlighted && (
                    <ArrowRightIcon className="w-4 h-4 shrink-0 text-[var(--accent)]" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Las pistas de teclado solo tienen sentido donde hay teclado. */}
        <footer className="hidden sm:flex px-4 py-2 border-t border-[var(--line)] t-meta justify-between">
          <span>
            <kbd className="px-1 rounded bg-[var(--surface-2)]">↑↓</kbd> navegar ·{' '}
            <kbd className="px-1 rounded bg-[var(--surface-2)]">⏎</kbd> elegir
          </span>
          <span>
            <kbd className="px-1 rounded bg-[var(--surface-2)]">esc</kbd> cerrar
          </span>
        </footer>
      </section>
    </dialog>
  );
}
