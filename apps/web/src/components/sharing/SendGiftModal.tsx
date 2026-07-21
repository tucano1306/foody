'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  readonly productId: string;
  readonly productName: string;
  readonly onClose: () => void;
}

export default function SendGiftModal({ productId, productName, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Promote to the top layer so the modal escapes any transformed ancestor
  // (product cards use hover:scale/-translate, which would otherwise trap a
  // plain position:fixed overlay inside the card). Also locks background scroll.
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    start(async () => {
      const res = await fetch('/api/sharing/gifts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, email: email.trim(), message: message.trim() || undefined }),
      });
      const json = await res.json() as { message?: string };
      if (res.ok) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(json.message ?? 'Error al enviar');
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose(); }}
      aria-label={`Enviar ${productName} a un amigo`}
      className="m-0 w-full max-w-none h-full max-h-none bg-transparent backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
        <div className="pointer-events-auto w-full sm:max-w-sm max-h-[92dvh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4 animate-fade-up">
          {success ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-5xl">🎁</div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">¡Regalo enviado!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">El destinatario recibirá una notificación en Compartir.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full py-3 rounded-2xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">🎁 Enviar producto</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Envía <span className="font-semibold text-gray-700 dark:text-gray-200">{productName}</span> a otro usuario de Foody
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition"
                >
                  ✕
                </button>
              </div>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-xl px-3 py-2">{error}</p>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label htmlFor="gift-email" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Email del destinatario
                  </label>
                  <input
                    id="gift-email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="amigo@ejemplo.com"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label htmlFor="gift-message" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Mensaje (opcional)
                  </label>
                  <textarea
                    id="gift-message"
                    rows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="¡Te lo regalo!"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || !email.trim()}
                    className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {isPending ? 'Enviando…' : 'Enviar regalo'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
